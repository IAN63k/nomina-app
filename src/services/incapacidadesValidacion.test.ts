import { describe, it, expect } from "vitest"
import {
  validarAtencion,
  validarCarga,
  validarEdicion,
  validarGestion,
  validarMasivo,
  validarParametros,
  validarPago,
  validarPqrdNueva,
  validarRespuestaPqrd,
} from "./incapacidadesValidacion"
import { PARAMETROS_POR_DEFECTO as P, type Incapacidad } from "@/src/types/incapacidad"

const HOY = "2026-11-05"
const actual: Incapacidad = {
  id: "00000000-0000-0000-0000-000000000001", identificacion: "1000", nroIncapacidad: "N1", nombre: "PRUEBA",
  concepto: 121, tipo: "Enfermedad general", esProrroga: false, dias: 10, diasAcumulados: 10,
  fechaDesde: "2026-09-01", fechaHasta: "2026-09-10", fechaRadicacionNomina: "2026-09-15", fechaRadicacionEps: null,
  valorIncapacidad: 500_000, eps: "SOS", valorFondoManual: null, estado: "Radicada", causalNoPago: null,
  responsable: null, observacion: null, finLactancia: null, sugeridoTransito: false, paraRevisar: [], origen: null,
}
const editar = (body: unknown, inc: Incapacidad = actual) => validarEdicion(body, inc, P, HOY)
const errorDe = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error)

describe("pagos", () => {
  it("exige fecha no posterior a hoy y valor mayor que 0", () => {
    expect(validarPago({ fechaPago: "2026-11-01", valor: 234_684 }, HOY)).toEqual({
      ok: true, valor: { fechaPago: "2026-11-01", valor: 234_684, tramo: "eps", observacion: null },
    })
    expect(errorDe(validarPago({ fechaPago: "2026-11-06", valor: 1 }, HOY))).toContain("posterior a hoy")
    expect(errorDe(validarPago({ fechaPago: "2026-11-01", valor: 0 }, HOY))).toContain("mayor que 0")
    expect(errorDe(validarPago({ valor: 10 }, HOY))).toContain("obligatoria")
    expect(errorDe(validarPago({ fechaPago: "2026-02-30", valor: 10 }, HOY))).toContain("no es una fecha válida")
    expect(errorDe(validarPago({ fechaPago: "2026-11-01", valor: 10, tramo: "otro" }, HOY))).toContain("tramo")
  })
})

describe("edición de seguimiento", () => {
  it("Rechazada sin causal no deja guardar; con causal sí", () => {
    expect(errorDe(editar({ estado: "Rechazada" }))).toContain("causal")
    const r = editar({ estado: "Rechazada", causalNoPago: "IPS no adscrita a la red" })
    expect(r).toMatchObject({ ok: true, valor: { cambios: { estado: "Rechazada", causal_no_pago: "IPS no adscrita a la red" } } })
  })

  it("Sin subsidio exige causal; reabrirla exige motivo", () => {
    expect(errorDe(editar({ estado: "Sin subsidio" }))).toContain("causal")
    const sinSub = { ...actual, estado: "Sin subsidio", causalNoPago: "Concepto de rehabilitación no favorable" }
    expect(errorDe(editar({ estado: "En trámite" }, sinSub))).toContain("reabrir")
    expect(editar({ estado: "En trámite", motivo: "Marcada por error" }, sinSub).ok).toBe(true)
  })

  it("Castigada y Prescrita exigen motivo", () => {
    expect(errorDe(editar({ estado: "Castigada" }))).toContain("motivo")
    expect(editar({ estado: "Castigada", motivo: "PQRD en contra" }).ok).toBe(true)
  })

  it("más de 180 días no se marca sin subsidio", () => {
    const larga = { ...actual, dias: 15, diasAcumulados: 400, esProrroga: true }
    expect(errorDe(editar({ estado: "Sin subsidio", causalNoPago: "Otra" }, larga))).toContain("fondo de pensiones")
  })

  it("valores fuera de lista, días acumulados menores a los días y campos desconocidos", () => {
    expect(errorDe(editar({ estado: "Inventado" }))).toContain("no está en la lista")
    expect(errorDe(editar({ tipo: "Gripa" }))).toContain("no está en la lista")
    expect(errorDe(editar({ diasAcumulados: 5 }))).toContain("mayor o igual a 10")
    expect(errorDe(editar({ fechaRadicacionEps: "2027-01-01" }))).toContain("posterior a hoy")
    expect(errorDe(editar({ nombre: "Otro", valorIncapacidad: 1 }))).toBe("No hay cambios")
  })

  it("marca reevaluar alertas solo si cambian tipo, días o prórroga", () => {
    expect(editar({ tipo: "Accidente de tránsito" })).toMatchObject({ ok: true, valor: { reevaluarAlertas: true } })
    expect(editar({ responsable: "Ana" })).toMatchObject({ ok: true, valor: { reevaluarAlertas: false } })
  })
})

describe("gestiones, PQRD y alertas", () => {
  it("gestión con tipo de la lista", () => {
    expect(validarGestion({ fecha: "2026-11-04", tipo: "Llamada", accion: "Se llamó a la EPS" }, HOY).ok).toBe(true)
    expect(errorDe(validarGestion({ fecha: "2026-11-04", tipo: "Fax", accion: "x" }, HOY))).toContain("Tipo de gestión")
  })

  it("PQRD nueva con entidad de la lista; respuesta exige fecha y resumen", () => {
    const base = { radicado: "PQ-1", entidad: "SOS", fechaRadicacion: "2026-10-30", motivo: "Rechazo" }
    expect(validarPqrdNueva(base, P, HOY).ok).toBe(true)
    expect(errorDe(validarPqrdNueva({ ...base, entidad: "Otra EPS" }, P, HOY))).toContain("no está en la lista")
    expect(errorDe(validarRespuestaPqrd({ estado: "Respondida a favor" }, HOY))).toContain("obligatoria")
    expect(validarRespuestaPqrd({ estado: "Respondida a favor", fechaRespuesta: "2026-11-04", resumenRespuesta: "Pagará" }, HOY).ok).toBe(true)
  })

  it("atender una alerta exige nota", () => {
    expect(validarAtencion({ nota: "  " }).ok).toBe(false)
    expect(validarAtencion({ nota: "Se pidió el concepto" })).toEqual({ ok: true, valor: "Se pidió el concepto" })
  })
})

describe("masivo y parámetros", () => {
  it("masivo solo admite estado, causal, radicación EPS y responsable", () => {
    const id = actual.id!
    expect(validarMasivo({ ids: [id, id], cambios: { responsable: "Ana" } })).toEqual({ ok: true, valor: { ids: [id], cambios: { responsable: "Ana" } } })
    expect(errorDe(validarMasivo({ ids: [id], cambios: { tipo: "x" } }))).toContain("solo admite")
    expect(errorDe(validarMasivo({ ids: ["x"], cambios: {} }))).toContain("inválidos")
  })

  it("parámetros: tipos, listas obligatorias y claves desconocidas", () => {
    expect(validarParametros({ diasMora: 45, hitosDias: [180, 90, 90] })).toEqual({ ok: true, valor: { diasMora: 45, hitosDias: [90, 180] } })
    expect(errorDe(validarParametros({ listaEstados: ["Radicada"] }))).toContain("debe incluir")
    expect(errorDe(validarParametros({ correosAlertas: ["no-es-correo"] }))).toContain("correos")
    expect(errorDe(validarParametros({ hackear: true }))).toContain("desconocido")
  })
})

describe("carga de KactuS", () => {
  const fila = {
    fila: 2, identificacion: "1000", nombre: "ANA PRUEBA", nroIncapacidad: "9000000001", concepto: 121,
    tipo: "Enfermedad general", esProrroga: false, dias: 5, diasAcumulados: 5, fechaDesde: "2026-08-03",
    fechaHasta: "2026-08-07", fechaRadicacionNomina: "2026-09-03", valorIncapacidad: 175_091,
    entidadKactus: "SERVICIOS OCCIDENTAL DE SALUD S.A S.O.S", eps: "SOS", finLactancia: null,
    observacion: "REG. INCAP - 9000000001", sugeridoTransito: true,
  }

  it("reconstruye las filas con lista blanca: un diagnóstico enviado se descarta", () => {
    const r = validarCarga({ archivo: "INCA.xlsx", filas: [{ ...fila, diagnostico: "S099" }] }, P)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toContain("S099")
  })

  it("rechaza archivos que no son .xlsx, fechas invertidas y EPS fuera de la lista", () => {
    expect(errorDe(validarCarga({ archivo: "INCA.csv", filas: [] }, P))).toContain(".xlsx")
    expect(errorDe(validarCarga({ archivo: "x.xlsx", filas: [{ ...fila, fechaHasta: "2026-08-01" }] }, P))).toContain("anterior")
    expect(errorDe(validarCarga({ archivo: "x.xlsx", filas: [{ ...fila, eps: "Otra" }] }, P))).toContain("EPS")
    expect(errorDe(validarCarga({ archivo: "x.xlsx", filas: [fila], fondosAsignados: { "1000": "Fondo X" } }, P))).toContain("Fondo")
  })

  it("acepta identificaciones alfanuméricas (extranjeros) y asignaciones válidas", () => {
    const r = validarCarga(
      { archivo: "x.xlsx", filas: [{ ...fila, identificacion: "PE123456" }], epsAsignadas: { "2": "Sura" }, fondosAsignados: { "1000": "Porvenir" } },
      P,
    )
    expect(r).toMatchObject({ ok: true, valor: { epsAsignadas: { "2": "Sura" }, fondosAsignados: { "1000": "Porvenir" } } })
  })
})
