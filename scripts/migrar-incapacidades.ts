/**
 * Migración inicial del libro "Seguimiento de incapacidades 2026" a Supabase (RF-11).
 *
 *   npm run migrar:incapacidades -- --libro <Seguimiento.xlsx> [--kactus <INCA.xlsx> ...] --usuario <quien>
 *   npm run migrar:incapacidades -- ... --aplicar      # escribe en Supabase
 *
 * Sin --aplicar es un simulacro: valida, aplica las reglas y compara los totales
 * del motor con los del libro, sin escribir nada. Con --aplicar llama a la
 * función atómica incapacidades_importar (docs/incapacidades_importar.sql) y
 * verifica en la BD que los totales quedaron iguales. Reejecutar es seguro: lo
 * que ya exista no se toca.
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.
 */

import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { leerKactus, type FilaKactus } from "@/src/services/incapacidadesParser"
import { leerCandidatosTransitoLibro, leerLibroSeguimiento } from "@/src/services/seguimientoLibroParser"
import { prepararMigracion, type PlanMigracion } from "@/src/services/incapacidadesMigracion"
import { calcularCobro, hoyBogota, llaveIncapacidad, resumenCartera } from "@/src/services/incapacidadesEngine"
import { PARAMETROS_POR_DEFECTO, type Pago } from "@/src/types/incapacidad"

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

function args() {
  const a = process.argv.slice(2)
  const valores = (flag: string) => a.flatMap((x, i) => (x === flag && a[i + 1] ? [a[i + 1]] : []))
  return {
    libro: valores("--libro")[0],
    kactus: valores("--kactus"),
    usuario: valores("--usuario")[0],
    aplicar: a.includes("--aplicar"),
  }
}

const leerArchivo = (p: string) => new Uint8Array(fs.readFileSync(p))

function fallar(msg: string): never {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

/** Totales del plan calculados con el motor (misma lógica que la app). */
function totalesPlan(plan: PlanMigracion) {
  const pagosPorLlave = new Map<string, Pago[]>()
  for (const p of plan.pagos) {
    const k = llaveIncapacidad(p.identificacion, p.nroIncapacidad)
    pagosPorLlave.set(k, [...(pagosPorLlave.get(k) ?? []), { incapacidadId: k, tramo: p.tramo, fechaPago: p.fechaPago, valor: p.valor, anulado: false }])
  }
  const params = PARAMETROS_POR_DEFECTO
  const corte = hoyBogota()
  const items = plan.incapacidades.map((inc) => ({
    inc,
    cobro: calcularCobro(inc, pagosPorLlave.get(llaveIncapacidad(inc.identificacion, inc.nroIncapacidad)) ?? [], { params, corte, fondo: null }),
  }))
  return resumenCartera(items, params)
}

const aFila = (i: PlanMigracion["incapacidades"][number]) => ({
  identificacion: i.identificacion,
  nro_incapacidad: i.nroIncapacidad,
  nombre: i.nombre,
  concepto: i.concepto,
  tipo: i.tipo,
  es_prorroga: i.esProrroga,
  dias: i.dias,
  dias_acumulados: i.diasAcumulados,
  fecha_desde: i.fechaDesde,
  fecha_hasta: i.fechaHasta,
  fecha_radicacion_nomina: i.fechaRadicacionNomina,
  fecha_radicacion_eps: i.fechaRadicacionEps,
  valor_incapacidad: i.valorIncapacidad,
  eps: i.eps,
  entidad_kactus: null,
  valor_fondo_manual: i.valorFondoManual,
  estado: i.estado,
  causal_no_pago: i.causalNoPago,
  responsable: i.responsable,
  observacion: i.observacion,
  fin_lactancia: i.finLactancia,
  sugerido_transito: i.sugeridoTransito,
  para_revisar: i.paraRevisar,
  origen: i.origen,
})

async function main() {
  const opt = args()
  if (!opt.libro) fallar("Falta --libro <ruta del libro de Seguimiento .xlsx>")
  if (!opt.usuario) fallar("Falta --usuario <quién ejecuta la migración> (queda en la auditoría)")

  // ── Leer ────────────────────────────────────────────────────────────────
  const datosLibro = leerArchivo(opt.libro)
  const libro = leerLibroSeguimiento(datosLibro)
  if (!libro.ok) fallar(libro.error)

  const kactus: FilaKactus[] = []
  for (const p of opt.kactus) {
    const r = leerKactus(leerArchivo(p), path.basename(p), PARAMETROS_POR_DEFECTO)
    if (!r.ok) fallar(`${p}: ${r.error}`)
    kactus.push(...r.filas)
  }

  // Candidatos de tránsito del libro → llave de su incapacidad más reciente.
  const candidatos = leerCandidatosTransitoLibro(datosLibro)
  const sugeridos = new Set<string>()
  for (const c of candidatos) {
    const f = libro.filas.find((x) => x.inc.identificacion.trim() === c.identificacion && x.inc.fechaHasta === c.ultimaFechaHasta)
    if (f) sugeridos.add(llaveIncapacidad(f.inc.identificacion, f.inc.nroIncapacidad))
  }

  const fechaMigracion = hoyBogota()
  const plan = prepararMigracion(libro.filas, { fechaMigracion, kactus, sugeridosTransito: sugeridos })

  // ── Validar contra el libro ─────────────────────────────────────────────
  const valorLibro = libro.filas.reduce((s, f) => s + f.inc.valorIncapacidad, 0)
  const pagadoLibro = libro.filas.reduce((s, f) => s + (f.valorPagado ?? 0), 0)
  const r = totalesPlan(plan)

  console.log("\n── Migración de incapacidades ─────────────────────────────")
  console.log(`Libro:            ${libro.filas.length} filas`)
  console.log(`KactuS (enriquece): ${kactus.length} filas de ${opt.kactus.length} archivo(s)`)
  console.log(`Incapacidades:    ${plan.incapacidades.length}`)
  console.log(`Pagos:            ${plan.pagos.length}`)
  console.log(`Gestiones:        ${plan.gestiones.length}`)
  console.log(`Sugeridas tránsito: ${plan.incapacidades.filter((i) => i.sugeridoTransito).length}`)
  console.log(`Con lactancia de KactuS: ${plan.incapacidades.filter((i) => i.finLactancia).length}`)
  console.log(`Para revisar:     ${plan.incapacidades.filter((i) => i.paraRevisar.length).length}`)
  const porRegla = (regla: string) => plan.cambios.filter((c) => c.regla === regla)
  console.log(`Regla 1 (Sin subsidio >180 → fondo):        ${porRegla("sin_subsidio_a_fondo").length}`)
  console.log(`Regla 2 (Rehabilitación → Sin subsidio):    ${porRegla("rehabilitacion_a_sin_subsidio").length} → ${porRegla("rehabilitacion_a_sin_subsidio").map((c) => c.nroIncapacidad).join(", ")}`)
  console.log(`Totales motor:  radicado ${pesos(r.totales.valor)} · pagado ${pesos(r.totales.pagado)} · saldo ${pesos(r.totales.saldo)}`)
  console.log(`Totales libro:  radicado ${pesos(valorLibro)} · pagado ${pesos(pagadoLibro)} · saldo ${pesos(valorLibro - pagadoLibro)}`)

  if (plan.errores.length) fallar(`Errores en el libro:\n  ${plan.errores.join("\n  ")}`)
  if (plan.incapacidades.length !== libro.filas.length) fallar("No se migran todas las filas del libro")
  if (r.totales.valor !== valorLibro || r.totales.pagado !== pagadoLibro) fallar("Los totales no cuadran con el libro")
  if (r.inconsistencias.length) fallar(r.inconsistencias.join("; "))
  console.log("✓ Totales cuadran con el libro")

  if (!opt.aplicar) {
    console.log("\nSimulacro: no se escribió nada. Agregue --aplicar para migrar.")
    return
  }

  // ── Escribir ────────────────────────────────────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fallar("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await db.rpc("incapacidades_importar", {
    p_carga: {
      archivo: path.basename(opt.libro),
      tipo: "migracion",
      usuario: opt.usuario,
      para_revisar: plan.incapacidades.filter((i) => i.paraRevisar.length).length,
      detalle: { kactus: opt.kactus.map((p) => path.basename(p)), cambios: plan.cambios },
    },
    p_incapacidades: plan.incapacidades.map(aFila),
    p_pagos: plan.pagos.map((p) => ({
      identificacion: p.identificacion, nro_incapacidad: p.nroIncapacidad, tramo: p.tramo,
      fecha_pago: p.fechaPago, valor: p.valor, observacion: p.observacion,
    })),
    p_gestiones: plan.gestiones.map((g) => ({
      identificacion: g.identificacion, nro_incapacidad: g.nroIncapacidad, fecha: g.fecha, tipo: g.tipo, accion: g.accion,
    })),
  })
  if (error) fallar(`Supabase: ${error.message}`)
  console.log(`\n✓ Importado: ${JSON.stringify(data)}`)

  // ── Verificar en la BD ──────────────────────────────────────────────────
  const { data: incs, error: e1 } = await db.from("incapacidades").select("valor_incapacidad").is("deleted_at", null)
  const { data: pagos, error: e2 } = await db.from("incapacidad_pagos").select("valor").eq("anulado", false)
  if (e1 || e2) fallar(`Verificación: ${(e1 ?? e2)!.message}`)
  const valorBd = incs!.reduce((s, x) => s + Number(x.valor_incapacidad), 0)
  const pagadoBd = pagos!.reduce((s, x) => s + Number(x.valor), 0)
  console.log(`BD: ${incs!.length} incapacidades · radicado ${pesos(valorBd)} · pagado ${pesos(pagadoBd)} · saldo ${pesos(valorBd - pagadoBd)}`)
  if (incs!.length !== plan.incapacidades.length || valorBd !== valorLibro || pagadoBd !== pagadoLibro) {
    fallar("La BD no cuadra con el libro: revise antes de seguir")
  }
  console.log("✓ La BD cuadra con el libro")
}

try {
  process.loadEnvFile(".env")
} catch {
  /* sin .env: solo el simulacro funciona */
}
main().catch((e) => fallar(e instanceof Error ? e.message : String(e)))
