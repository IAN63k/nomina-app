import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { construirLibro, ENCABEZADOS_SEGUIMIENTO, libroABytes, nombreArchivoExport, type ItemExportable } from "./incapacidadesExport"
import { calcularCobro, resumenCartera } from "./incapacidadesEngine"
import { PARAMETROS_POR_DEFECTO as P, type Incapacidad, type Pago } from "@/src/types/incapacidad"

const CORTE = "2026-11-04"
let n = 0
function item(over: Partial<Incapacidad> = {}, pagos: number[] = [], extra: Partial<ItemExportable> = {}): ItemExportable {
  n++
  const inc: Incapacidad = {
    id: `i${n}`, identificacion: `1000${n}`, nroIncapacidad: `N${n}`, nombre: `COLABORADOR ${n}`, concepto: 121,
    tipo: "Enfermedad general", esProrroga: false, dias: 3, diasAcumulados: 3, fechaDesde: "2026-09-01", fechaHasta: "2026-09-03",
    fechaRadicacionNomina: "2026-09-10", fechaRadicacionEps: null, valorIncapacidad: 100_000, eps: "SOS", valorFondoManual: null,
    estado: "Radicada", causalNoPago: null, responsable: null, observacion: null, finLactancia: null, sugeridoTransito: false,
    paraRevisar: [], origen: null, ...over,
  }
  const ps: Pago[] = pagos.map((v) => ({ incapacidadId: inc.id!, tramo: "eps", fechaPago: "2026-10-01", valor: v, anulado: false }))
  return { inc, cobro: calcularCobro(inc, ps, { params: P, corte: CORTE, fondo: null }), ...extra }
}

/** Genera el .xlsx en bytes y lo vuelve a abrir: si abre aquí, abre en Excel. */
const reabrir = (items: ItemExportable[]) => XLSX.read(libroABytes(construirLibro(items, P, CORTE)), { type: "array", cellNF: true })
const valor = (ws: XLSX.WorkSheet, ref: string) => ws[ref]?.v

describe("exportación a Excel", () => {
  const items = [
    item({ valorIncapacidad: 500_000, estado: "Pagada" }, [500_000]),
    item({ valorIncapacidad: 300_000, fechaRadicacionNomina: "2026-08-01" }),
    item({ tipo: "Licencia de maternidad", dias: 126, diasAcumulados: 126, fechaDesde: "2026-09-28", fechaHasta: "2027-01-31", finLactancia: "2027-03-27", valorIncapacidad: 8_000_000 }),
    item({ tipo: "Accidente de tránsito", dias: 21, diasAcumulados: 42, esProrroga: true, fechaDesde: "2026-10-10", fechaHasta: "2026-10-30" }, [], { radicadoPqrd: "PQ-1" }),
  ]

  it("tiene las cuatro hojas del libro con los encabezados de Seguimiento en la fila 4", () => {
    const wb = reabrir(items)
    expect(wb.SheetNames).toEqual(["Seguimiento", "Resumen", "Accidentes tránsito", "Licencias maternidad"])
    const enc = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Seguimiento, { header: 1 })[3]
    expect(enc).toEqual(ENCABEZADOS_SEGUIMIENTO)
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Seguimiento, { header: 1 }).slice(4)
    expect(filas).toHaveLength(items.length)
  })

  it("las fechas son fechas de Excel (dd/mm/aaaa) del día correcto y los valores son números en pesos", () => {
    const ws = reabrir(items).Sheets.Seguimiento
    const desde = ws["H5"]
    expect(desde.t).toBe("n")
    expect(desde.z).toBe("dd/mm/yyyy")
    const d = XLSX.SSF.parse_date_code(desde.v as number)
    expect(`${d.y}-${d.m}-${d.d}`).toBe("2026-9-28") // primera fila: la licencia que termina más tarde (31/01/2027)
    expect(ws["L5"].t).toBe("n")
    expect(String(ws["L5"].z)).toContain("#,##0")
  })

  it("los totales del Resumen exportado son los del Resumen de la app", () => {
    const ws = reabrir(items).Sheets.Resumen
    const r = resumenCartera(items, P)
    expect(valor(ws, "B4")).toBe(r.totales.valor)
    expect(valor(ws, "B5")).toBe(r.totales.pagado)
    expect(valor(ws, "B6")).toBe(r.totales.saldo)
    expect(valor(ws, "B8")).toBe(r.conteos.enMora)
  })

  it("las vistas llevan sus filas: tránsito con 42 días y maternidad con reintegro y lactancia", () => {
    const wb = reabrir(items)
    const tr = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Accidentes tránsito"], { header: 1 })
    expect(tr[7][7]).toBe(42) // Días acumulados
    expect(tr[7][8]).toBe(138) // Días para llegar a 180
    const mat = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Licencias maternidad"], { header: 1, raw: false })
    expect(mat[7][7]).toBe("01/02/2027") // reintegro
    expect(mat[7][10]).toBe("27/03/2027") // fin de lactancia
  })

  it("la PQRD abierta aparece en Nº gestión y nunca se exporta un diagnóstico", () => {
    const wb = reabrir(items)
    const texto = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets.Seguimiento, { header: 1 }))
    expect(texto).toContain("PQ-1")
    expect(texto.toLowerCase()).not.toContain("diagn")
  })

  it("nombre del archivo con la fecha de corte", () => {
    expect(nombreArchivoExport(CORTE)).toBe("Seguimiento_Incapacidades_2026-11-04.xlsx")
  })
})
