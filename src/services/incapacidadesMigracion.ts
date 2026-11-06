/**
 * Migración inicial (RF-11): libro "Seguimiento de incapacidades 2026" →
 * tablas del módulo. Funciones puras; el script scripts/migrar-incapacidades.ts
 * las ejecuta y escribe en Supabase.
 *
 * Reglas confirmadas por nómina (2026-11-05):
 *  1. "Sin subsidio" que supera 180 días acumulados → pasa a cobro al fondo de
 *     pensiones (estado Radicada, sin causal). Desde el día 181 no es "sin
 *     subsidio": lo paga el fondo.
 *  2. "Rechazada" con causal "Concepto de rehabilitación no favorable" →
 *     "Sin subsidio" (ninguna entidad la paga por norma; la EPS no la pagó).
 *  3. Cada "Valor pagado" del libro es un pago con su "Fecha de pago".
 *  4. "Nº gestión" sin fecha → gestión registrada con la fecha de migración,
 *     aclarando en el texto que no tenía fecha.
 *
 * Si se dan los archivos de KactuS de donde salieron las filas, se toman de
 * ahí la Fecha Final de Lactancia y la marca de posible tránsito (el
 * diagnóstico se descarta).
 */

import { diasFondo, llaveIncapacidad } from "@/src/services/incapacidadesEngine"
import { MOTIVO, type FilaKactus } from "@/src/services/incapacidadesParser"
import type { FilaLibro } from "@/src/services/seguimientoLibroParser"
import { ESTADO, TIPO, type FechaISO, type Incapacidad } from "@/src/types/incapacidad"

export const ORIGEN_MIGRACION = "Migración libro Seguimiento 2026"
export const CAUSAL_REHABILITACION = "Concepto de rehabilitación no favorable"

const CONCEPTO_POR_TIPO: Record<string, number> = {
  [TIPO.enfermedadGeneral]: 121,
  [TIPO.maternidad]: 122,
  [TIPO.paternidad]: 123,
  [TIPO.accidenteTrabajo]: 124,
}

export interface PagoMigrado {
  identificacion: string
  nroIncapacidad: string
  tramo: "eps" | "fondo"
  fechaPago: FechaISO
  valor: number
  observacion: string
}

export interface GestionMigrada {
  identificacion: string
  nroIncapacidad: string
  fecha: FechaISO
  tipo: string
  accion: string
}

export interface CambioMigracion {
  identificacion: string
  nroIncapacidad: string
  regla: "sin_subsidio_a_fondo" | "rehabilitacion_a_sin_subsidio"
  antes: string
  despues: string
}

export interface PlanMigracion {
  incapacidades: Incapacidad[]
  pagos: PagoMigrado[]
  gestiones: GestionMigrada[]
  cambios: CambioMigracion[]
  errores: string[]
}

function agregarObservacion(obs: string | null, nota: string): string {
  return obs ? `${obs} · ${nota}` : nota
}

function origenDe(obs: string | null): string {
  const m = /Origen:\s*([^·]+)/.exec(obs ?? "")
  return m ? m[1].trim() : ORIGEN_MIGRACION
}

export function prepararMigracion(
  filas: FilaLibro[],
  opts: { fechaMigracion: FechaISO; kactus?: FilaKactus[]; sugeridosTransito?: Set<string> },
): PlanMigracion {
  const plan: PlanMigracion = { incapacidades: [], pagos: [], gestiones: [], cambios: [], errores: [] }
  const kactus = new Map((opts.kactus ?? []).map((k) => [llaveIncapacidad(k.identificacion, k.nroIncapacidad), k]))
  const vistas = new Set<string>()

  for (const f of filas) {
    const original = f.inc
    const identificacion = original.identificacion.trim()
    const nroIncapacidad = original.nroIncapacidad.trim()
    const llave = llaveIncapacidad(identificacion, nroIncapacidad)
    const donde = `fila ${f.fila} (${nroIncapacidad})`

    if (!nroIncapacidad) { plan.errores.push(`${donde}: sin Nº de incapacidad`); continue }
    if (!original.fechaDesde || !original.fechaHasta) { plan.errores.push(`${donde}: sin fechas`); continue }
    if (original.fechaHasta < original.fechaDesde) { plan.errores.push(`${donde}: Fecha hasta anterior a Fecha desde`); continue }
    if (vistas.has(llave)) { plan.errores.push(`${donde}: incapacidad duplicada en el libro`); continue }
    vistas.add(llave)

    const k = kactus.get(llave)
    const inc: Incapacidad = {
      ...original,
      identificacion,
      nroIncapacidad,
      concepto: k?.concepto ?? CONCEPTO_POR_TIPO[original.tipo] ?? null,
      finLactancia: original.tipo === TIPO.maternidad ? (k?.finLactancia ?? null) : null,
      sugeridoTransito: Boolean(k?.sugeridoTransito || opts.sugeridosTransito?.has(llave)),
      origen: origenDe(original.observacion),
      paraRevisar: [],
    }
    const fondo = diasFondo(inc) > 0

    // Regla 1: más de 180 días no es "sin subsidio": se cobra al fondo.
    if (inc.estado === ESTADO.sinSubsidio && fondo) {
      plan.cambios.push({ identificacion, nroIncapacidad, regla: "sin_subsidio_a_fondo", antes: inc.estado, despues: ESTADO.radicada })
      inc.estado = ESTADO.radicada
      inc.causalNoPago = null
      inc.observacion = agregarObservacion(inc.observacion, "Migración: pasa a cobro al fondo de pensiones (antes Sin subsidio)")
    }

    // Regla 2: concepto de rehabilitación no favorable → nadie la paga.
    if (inc.estado === ESTADO.rechazada && inc.causalNoPago === CAUSAL_REHABILITACION) {
      plan.cambios.push({ identificacion, nroIncapacidad, regla: "rehabilitacion_a_sin_subsidio", antes: inc.estado, despues: ESTADO.sinSubsidio })
      inc.estado = ESTADO.sinSubsidio
      inc.observacion = agregarObservacion(inc.observacion, "Migración: Rechazada → Sin subsidio (concepto de rehabilitación no favorable)")
    }

    // Mismas marcas "para revisar" que la carga de KactuS.
    const cerradaSinValor = inc.estado === ESTADO.sinSubsidio || inc.estado === ESTADO.rechazada
    if (inc.valorIncapacidad === 0 && fondo) inc.paraRevisar.push(MOTIVO.fondoValorCero)
    else if (fondo) inc.paraRevisar.push(MOTIVO.fondo)
    else if (inc.valorIncapacidad === 0 && !cerradaSinValor) inc.paraRevisar.push(MOTIVO.valorCero)

    plan.incapacidades.push(inc)

    if (f.valorPagado !== null && f.valorPagado > 0) {
      if (!f.fechaPago) {
        plan.errores.push(`${donde}: Valor pagado sin Fecha de pago`)
      } else {
        plan.pagos.push({
          identificacion,
          nroIncapacidad,
          tramo: "eps",
          fechaPago: f.fechaPago,
          valor: Math.round(f.valorPagado),
          observacion: "Pago registrado en el libro de Seguimiento (migración)",
        })
      }
    }

    if (f.nroGestion) {
      plan.gestiones.push({
        identificacion,
        nroIncapacidad,
        fecha: f.fechaGestion ?? opts.fechaMigracion,
        tipo: "Reclamación",
        accion: f.fechaGestion
          ? `Nº gestión (PQRD / radicado): ${f.nroGestion}`
          : `Nº gestión (PQRD / radicado): ${f.nroGestion} — registrado en el libro sin fecha; fecha = día de la migración`,
      })
    }
  }

  return plan
}
