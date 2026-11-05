import { describe, it, expect } from "vitest"
import { prepararMigracion, CAUSAL_REHABILITACION } from "./incapacidadesMigracion"
import { MOTIVO } from "./incapacidadesParser"
import type { FilaLibro } from "./seguimientoLibroParser"
import type { Incapacidad } from "@/src/types/incapacidad"

let n = 0
function fila(over: Partial<Incapacidad> = {}, extra: Partial<FilaLibro> = {}): FilaLibro {
  n++
  return {
    fila: n + 4,
    inc: {
      identificacion: "1000", nroIncapacidad: ` N${n} `, nombre: "PRUEBA", concepto: null, tipo: "Enfermedad general",
      esProrroga: false, dias: 3, diasAcumulados: 3, fechaDesde: "2026-09-01", fechaHasta: "2026-09-03",
      fechaRadicacionNomina: "2026-09-10", fechaRadicacionEps: null, valorIncapacidad: 100_000, eps: "SOS",
      valorFondoManual: null, estado: "Radicada", causalNoPago: null, responsable: null, observacion: null,
      finLactancia: null, sugeridoTransito: false, paraRevisar: [], origen: null, ...over,
    },
    valorPagado: null, fechaPago: null, nroGestion: null, fechaGestion: null, excel: { saldo: null, alerta: null },
    ...extra,
  }
}
const migrar = (filas: FilaLibro[]) => prepararMigracion(filas, { fechaMigracion: "2026-11-05" })

describe("reglas de migración", () => {
  it("Sin subsidio de más de 180 días pasa a cobro al fondo", () => {
    const p = migrar([fila({ estado: "Sin subsidio", causalNoPago: "Incapacidad superior a 180 días", dias: 15, diasAcumulados: 206, esProrroga: true, valorIncapacidad: 0 })])
    expect(p.incapacidades[0]).toMatchObject({ estado: "Radicada", causalNoPago: null, paraRevisar: [MOTIVO.fondoValorCero] })
    expect(p.incapacidades[0].observacion).toContain("pasa a cobro al fondo de pensiones")
    expect(p.cambios[0].regla).toBe("sin_subsidio_a_fondo")
  })

  it("Sin subsidio que no supera 180 días se queda igual", () => {
    const p = migrar([fila({ estado: "Sin subsidio", valorIncapacidad: 0 })])
    expect(p.incapacidades[0].estado).toBe("Sin subsidio")
    expect(p.cambios).toEqual([])
  })

  it("Rechazada por concepto de rehabilitación no favorable → Sin subsidio (conserva la causal)", () => {
    const p = migrar([fila({ estado: "Rechazada", causalNoPago: CAUSAL_REHABILITACION, valorIncapacidad: 0 })])
    expect(p.incapacidades[0]).toMatchObject({ estado: "Sin subsidio", causalNoPago: CAUSAL_REHABILITACION, paraRevisar: [] })
  })

  it("otras rechazadas no cambian", () => {
    const p = migrar([fila({ estado: "Rechazada", causalNoPago: "No cumple mínimo de semanas de cotización" })])
    expect(p.incapacidades[0].estado).toBe("Rechazada")
  })

  it("pagos y gestiones; gestión sin fecha usa la de migración y lo dice", () => {
    const p = migrar([fila({}, { valorPagado: 99_000, fechaPago: "2026-10-01", nroGestion: "2608332" })])
    expect(p.pagos).toEqual([expect.objectContaining({ valor: 99_000, fechaPago: "2026-10-01", tramo: "eps" })])
    expect(p.gestiones[0]).toMatchObject({ fecha: "2026-11-05" })
    expect(p.gestiones[0].accion).toContain("sin fecha")
  })

  it("normaliza el Nº, toma el origen y marca valor $0 para revisar", () => {
    const p = migrar([fila({ valorIncapacidad: 0, observacion: "Concepto 121 · Origen: INCA DE SEP A OCT 26" })])
    expect(p.incapacidades[0]).toMatchObject({ origen: "INCA DE SEP A OCT 26", paraRevisar: [MOTIVO.valorCero], concepto: 121 })
    expect(p.incapacidades[0].nroIncapacidad).toMatch(/^N\d+$/)
  })

  it("reporta duplicadas, fechas invertidas y pagos sin fecha", () => {
    const a = fila()
    const p = migrar([
      a,
      { ...a, fila: 99 },
      fila({ fechaDesde: "2026-09-05", fechaHasta: "2026-09-01" }),
      fila({}, { valorPagado: 10, fechaPago: null }),
    ])
    expect(p.errores).toHaveLength(3)
  })
})
