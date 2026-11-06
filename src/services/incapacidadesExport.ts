/**
 * Exportación a Excel (RF-09, opcional, para informes) con la estructura del
 * libro "Seguimiento de incapacidades 2026": hojas Seguimiento, Resumen,
 * Accidentes tránsito y Licencias maternidad.
 *
 * Todo sale del motor (incapacidadesEngine.ts): los totales del archivo son
 * los mismos del Resumen de la app. Valores, no fórmulas. Fechas como fechas
 * reales de Excel (dd/mm/aaaa) y pesos sin decimales (RNF-05). El diagnóstico
 * no existe en la app, así que nunca se exporta.
 */

import * as XLSX from "xlsx"
import {
  resumenCartera,
  vistaMaternidad,
  vistaTransito,
  type IncapacidadCalculada,
} from "@/src/services/incapacidadesEngine"
import type { FechaISO, ParametrosIncapacidades } from "@/src/types/incapacidad"

export interface ItemExportable extends IncapacidadCalculada {
  /** Nº de radicado de la PQRD abierta, si hay. */
  radicadoPqrd?: string | null
  ultimaGestion?: FechaISO | null
}

const FORMATO_FECHA = "dd/mm/yyyy"
const FORMATO_PESOS = '"$" #,##0;-"$" #,##0'
const FORMATO_PCT = "0.0%"

type Celda = string | number | boolean | null | undefined | { f: "fecha" | "pesos" | "pct"; v: number | string | null | undefined }

/** Fecha ISO → número de serie de Excel (sin zona horaria: no corre días). */
function serial(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

const fecha = (iso: string | null | undefined): Celda => ({ f: "fecha", v: iso ?? null })
const pesos = (n: number | null | undefined): Celda => ({ f: "pesos", v: n ?? null })
const pct = (n: number): Celda => ({ f: "pct", v: n })

/** Crea una hoja a partir de filas de celdas, aplicando formatos y anchos. */
function hoja(filas: Celda[][], anchos: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  let maxCol = 0
  filas.forEach((fila, r) => {
    maxCol = Math.max(maxCol, fila.length)
    fila.forEach((c, col) => {
      if (c === null || c === undefined || c === "") return
      const ref = XLSX.utils.encode_cell({ r, c: col })
      if (typeof c === "object") {
        if (c.v === null || c.v === undefined || c.v === "") return
        if (c.f === "fecha") ws[ref] = { t: "n", v: serial(String(c.v)), z: FORMATO_FECHA }
        else if (c.f === "pesos") ws[ref] = { t: "n", v: Number(c.v), z: FORMATO_PESOS }
        else ws[ref] = { t: "n", v: Number(c.v), z: FORMATO_PCT }
      } else if (typeof c === "number") {
        ws[ref] = { t: "n", v: c }
      } else if (typeof c === "boolean") {
        ws[ref] = { t: "s", v: c ? "Sí" : "No" }
      } else {
        ws[ref] = { t: "s", v: c }
      }
    })
  })
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length - 1, 0), c: Math.max(maxCol - 1, 0) } })
  ws["!cols"] = anchos.map((wch) => ({ wch }))
  return ws
}

export const ENCABEZADOS_SEGUIMIENTO = [
  "Identificación", "Nombre del colaborador", "Nº incapacidad", "EPS", "Días", "¿Es prórroga?", "Días acumulados",
  "Fecha desde", "Fecha hasta", "Fecha radicación nómina", "Fecha radicación EPS", "Valor incapacidad", "Estado",
  "Fecha de pago", "Valor pagado", "Saldo pendiente", "Días desde radicación", "Fecha estimada de prescripción",
  "Alerta", "Causal de no pago", "Nº gestión (PQRD / radicado)", "Fecha última gestión", "Acción / observación",
  "Responsable", "Tipo de incapacidad",
  // Columnas nuevas de la app (después de las del libro, para no mover las existentes):
  "Entidad de cobro", "Para revisar",
]

export function construirLibro(items: ItemExportable[], params: ParametrosIncapacidades, corte: FechaISO): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const ordenados = [...items].sort(
    (a, b) => b.inc.fechaHasta.localeCompare(a.inc.fechaHasta) || a.inc.nombre.localeCompare(b.inc.nombre),
  )

  // ── Seguimiento ──────────────────────────────────────────────────────────
  const filasSeg: Celda[][] = [
    ["SEGUIMIENTO DE INCAPACIDADES Y/O LICENCIAS"],
    ["Fecha de corte:", fecha(corte), null, "Exportado desde la app de nómina. Valores calculados con las reglas del módulo."],
    [],
    ENCABEZADOS_SEGUIMIENTO,
    ...ordenados.map(({ inc, cobro, radicadoPqrd, ultimaGestion }) => [
      inc.identificacion, inc.nombre, inc.nroIncapacidad, inc.eps, inc.dias, inc.esProrroga, inc.diasAcumulados,
      fecha(inc.fechaDesde), fecha(inc.fechaHasta), fecha(inc.fechaRadicacionNomina), fecha(inc.fechaRadicacionEps),
      pesos(cobro.valor), inc.estado, fecha(cobro.fechaUltimoPago), cobro.pagado ? pesos(cobro.pagado) : null,
      pesos(cobro.saldo), cobro.diasDesdeRadicacion, fecha(cobro.fechaPrescripcion), cobro.alerta, inc.causalNoPago,
      radicadoPqrd ?? null, fecha(ultimaGestion), inc.observacion, inc.responsable, inc.tipo,
      cobro.tramos.map((t) => t.entidad).join(" + "),
      [...new Set([...inc.paraRevisar, ...cobro.avisos])].join(" · ") || null,
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, hoja(filasSeg, [14, 34, 18, 16, 7, 10, 10, 11, 11, 12, 12, 14, 14, 11, 14, 14, 10, 12, 20, 30, 18, 12, 50, 18, 22, 24, 50]), "Seguimiento")

  // ── Resumen ──────────────────────────────────────────────────────────────
  const r = resumenCartera(items, params)
  const filasRes: Celda[][] = [
    ["RESUMEN DE CARTERA DE INCAPACIDADES"],
    ["Corte:", fecha(corte)],
    [],
    ["Valor radicado", pesos(r.totales.valor)],
    ["Valor pagado", pesos(r.totales.pagado)],
    ["Saldo pendiente", pesos(r.totales.saldo)],
    ["% recuperación acumulada", pct(r.totales.recuperacion)],
    ["Incapacidades en mora", r.conteos.enMora],
    ["Incapacidades en riesgo de prescripción", r.conteos.riesgoPrescripcion],
    ["Incapacidades rechazadas por gestionar", r.conteos.rechazadasPorGestionar],
    ["Incapacidades con pago menor al valor", r.conteos.pagoMenor, pesos(r.conteos.saldoPagoMenor), "Saldo que dejaron de pagar"],
    [],
    ["POR ENTIDAD DE COBRO"],
    ["Entidad", "# incapacidades", "Valor radicado", "Valor pagado", "Saldo pendiente", "% recuperación", "# en mora", "# riesgo prescripción"],
    ...r.porEntidad.map((f) => [
      f.esFondo ? `${f.entidad} (fondo)` : f.entidad, f.incapacidades, pesos(f.valor), pesos(f.pagado), pesos(f.saldo),
      pct(f.recuperacion), f.enMora, f.riesgoPrescripcion,
    ]),
    ["TOTAL", null, pesos(r.totales.valor), pesos(r.totales.pagado), pesos(r.totales.saldo), pct(r.totales.recuperacion), r.conteos.enMora, r.conteos.riesgoPrescripcion],
    ["Control: valor radicado de entidades fuera de las listas", null, pesos(r.valorFueraDeLista), "Debe ser $0."],
    [],
    ["POR ESTADO"],
    ["Estado", "# incapacidades", "Valor radicado", "Saldo pendiente"],
    ...r.porEstado.map((f) => [f.estado, f.incapacidades, pesos(f.valor), pesos(f.saldo)]),
  ]
  XLSX.utils.book_append_sheet(wb, hoja(filasRes, [46, 16, 18, 18, 18, 14, 10, 18]), "Resumen")

  // ── Accidentes tránsito ──────────────────────────────────────────────────
  const t = vistaTransito(items, corte, params)
  const filasTr: Celda[][] = [
    ["Seguimiento de incapacidades por accidente de tránsito – control de 180 días"],
    ["Corte:", fecha(corte)],
    [],
    ["Colaboradores en seguimiento", "Se acercan al día 120 (90+ días)", "Día 120+ (concepto de rehabilitación)", "Día 150+ (remisión a AFP)", "Superaron 180 días"],
    [t.indicadores.colaboradores, t.indicadores.seAcercanA120, t.indicadores.dia120, t.indicadores.dia150, t.indicadores.superaron180],
    [],
    ["Identificación", "Colaborador", "Nº incapacidad", "EPS", "Fecha desde", "Fecha hasta", "Días", "Días acumulados",
      "Días para llegar a 180", "Fecha estimada día 120", "Fecha estimada día 150", "Fecha estimada día 180",
      "Registro más reciente", "Estado / acción", "Valor incapacidad", "Saldo pendiente", "Estado cobro"],
    ...t.filas.map((f) => [
      f.item.inc.identificacion, f.item.inc.nombre, f.item.inc.nroIncapacidad, f.item.inc.eps, fecha(f.item.inc.fechaDesde),
      fecha(f.item.inc.fechaHasta), f.item.inc.dias, f.diasAcumulados, f.diasPara180, fecha(f.fechaDia120), fecha(f.fechaDia150),
      fecha(f.fechaDia180), f.registroMasReciente ? "Sí" : "", f.estado, pesos(f.item.cobro.valor), pesos(f.item.cobro.saldo), f.item.inc.estado,
    ]),
    [],
    ["POSIBLES CASOS POR CONFIRMAR (diagnóstico de lesión y 30+ días; el diagnóstico no se guarda)"],
    ["Identificación", "Nombre", "Días acumulados", "Última fecha hasta", "Incapacidades sugeridas"],
    ...t.candidatos.map((c) => [c.identificacion, c.nombre, c.diasAcumulados, fecha(c.ultimaFechaHasta), c.nrosSugeridos.join(", ")]),
  ]
  XLSX.utils.book_append_sheet(wb, hoja(filasTr, [14, 34, 18, 16, 11, 11, 7, 10, 10, 12, 12, 12, 10, 48, 14, 14, 14]), "Accidentes tránsito")

  // ── Licencias maternidad ─────────────────────────────────────────────────
  const m = vistaMaternidad(items, corte)
  const filasMat: Celda[][] = [
    ["Seguimiento de licencias de maternidad"],
    ["Corte:", fecha(corte)],
    [],
    ["Licencias en curso", "Reintegros en los próximos 30 días", "Por iniciar", "Saldo por cobrar", "En mora"],
    [m.indicadores.enCurso, m.indicadores.reintegrosProximos, m.indicadores.porIniciar, pesos(m.indicadores.saldoPorCobrar), m.indicadores.enMora],
    [],
    ["Identificación", "Colaboradora", "Nº incapacidad", "EPS", "Fecha desde", "Fecha hasta", "Días", "Fecha de reintegro",
      "Días restantes", "Estado de la licencia", "Fin hora de lactancia", "Valor incapacidad", "Fecha radicación EPS", "Estado",
      "Valor pagado", "Saldo pendiente", "Alerta"],
    ...[...m.filas].sort((a, b) => b.item.inc.fechaDesde.localeCompare(a.item.inc.fechaDesde)).map((f) => [
      f.item.inc.identificacion, f.item.inc.nombre, f.item.inc.nroIncapacidad, f.item.inc.eps, fecha(f.item.inc.fechaDesde),
      fecha(f.item.inc.fechaHasta), f.item.inc.dias, fecha(f.fechaReintegro), f.diasRestantes, f.estado, fecha(f.finLactancia),
      pesos(f.item.cobro.valor), fecha(f.item.inc.fechaRadicacionEps), f.item.inc.estado, pesos(f.item.cobro.pagado),
      pesos(f.item.cobro.saldo), f.item.cobro.alerta,
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, hoja(filasMat, [14, 34, 18, 16, 11, 11, 7, 12, 10, 26, 12, 14, 12, 14, 14, 14, 20]), "Licencias maternidad")

  return wb
}

/** Nombre del archivo: Seguimiento_Incapacidades_AAAA-MM-DD.xlsx */
export const nombreArchivoExport = (corte: FechaISO) => `Seguimiento_Incapacidades_${corte}.xlsx`

export function libroABytes(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as Uint8Array
}
