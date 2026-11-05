import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { COLUMNAS_KACTUS, MOTIVO, leerKactus, normalizarEps, prepararCarga } from "./incapacidadesParser"
import { PARAMETROS_POR_DEFECTO as P } from "@/src/types/incapacidad"

const ENC = Object.values(COLUMNAS_KACTUS)
type Fila = Partial<Record<keyof typeof COLUMNAS_KACTUS, unknown>>

function libro(filas: Fila[], encabezados: string[] = ["Otra columna", ...ENC, "Indicador Prorroga"]): Uint8Array {
  const keys = Object.keys(COLUMNAS_KACTUS) as (keyof typeof COLUMNAS_KACTUS)[]
  const aoa = [
    encabezados,
    ...filas.map((f) =>
      encabezados.map((h) => {
        const k = keys.find((k) => COLUMNAS_KACTUS[k] === h)
        return k ? (f[k] ?? null) : "S"
      }),
    ),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "KactuS - KNmIncap")
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array
}

const base: Fila = {
  identificacion: 1000,
  nombres: "ANA",
  apellidos: "PRUEBA",
  nro: " 7003430648 ",
  concepto: 121,
  nombreConcepto: "INCAPACIDAD POR ENFERMEDAD GENERAL",
  dias: 5,
  fechaDesde: new Date(2026, 7, 3),
  fechaHasta: new Date(2026, 7, 7),
  fechaRadicacion: new Date(2026, 8, 3),
  valor: 175091,
  entidad: "SERVICIOS OCCIDENTAL DE SALUD S.A S.O.S",
  diagnostico: "L923",
  observaciones: "REG. INCAP - 7003430648",
}

const leer = (filas: Fila[], nombre = "INCA.xlsx") => {
  const r = leerKactus(libro(filas), nombre, P)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe("normalizarEps", () => {
  it.each([
    ["SERVICIOS OCCIDENTAL DE SALUD S.A S.O.S", "SOS"],
    ["E.P.S. SURA", "Sura"],
    ["E.P.S. SANITAS S.A.", "Sanitas"],
    ["NUEVA EPS", "Nueva EPS"],
    ["SALUD TOTAL S.A. E.P.S.", "Salud Total"],
    ["COMFENALCO VALLE E.P.S", "Comfenalco Valle"],
    ["COLMENA SEGUROS RIESGOS LABORALES", "Colmena ARL"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarEps(entrada, P.listaEps)).toBe(esperado)
  })
  it("entidad desconocida → null", () => {
    expect(normalizarEps("CAPRESOCA EPS", P.listaEps)).toBeNull()
    expect(normalizarEps("", P.listaEps)).toBeNull()
  })
})

describe("leerKactus", () => {
  it("rechaza archivos que no son .xlsx", () => {
    const r = leerKactus(libro([base]), "INCA.xls", P)
    expect(r.ok).toBe(false)
  })

  it("rechaza la carga si falta una columna y dice cuál", () => {
    const sinValor = ENC.filter((h) => h !== "Valor incapacidad")
    const r = leerKactus(libro([base], sinValor), "INCA.xlsx", P)
    expect(r).toMatchObject({ ok: false, columnasFaltantes: ["Valor incapacidad"] })
  })

  it("mapea la fila a los campos de Seguimiento", () => {
    const { filas } = leer([base, { ...base, nro: "7003439042", prorrogada: "7003430648", dias: 11, diasTotales: 16 }])
    expect(filas[0]).toMatchObject({
      identificacion: "1000",
      nombre: "ANA PRUEBA",
      nroIncapacidad: "7003430648",
      tipo: "Enfermedad general",
      esProrroga: false,
      dias: 5,
      diasAcumulados: 5, // Días Totales vacío → Número Días
      fechaDesde: "2026-08-03",
      fechaHasta: "2026-08-07",
      fechaRadicacionNomina: "2026-09-03",
      valorIncapacidad: 175091,
      eps: "SOS",
      observacion: "REG. INCAP - 7003430648",
      sugeridoTransito: false,
    })
    expect(filas[1]).toMatchObject({ esProrroga: true, diasAcumulados: 16 })
  })

  it("no expone el diagnóstico; solo la marca de tránsito", () => {
    const { filas } = leer([{ ...base, diagnostico: "S099" }])
    expect(filas[0].sugeridoTransito).toBe(true)
    expect(JSON.stringify(filas)).not.toContain("S099")
  })

  it("rechaza filas inválidas y sigue con las demás", () => {
    const r = leer([
      { ...base, identificacion: null },
      { ...base, nro: "  " },
      { ...base, fechaHasta: null },
      { ...base, fechaDesde: new Date(2026, 7, 10) },
      base,
    ])
    expect(r.rechazadas.map((x) => x.motivo)).toEqual([
      "Sin Identificación",
      "Sin Nº de incapacidad",
      "Sin Fecha desde o Fecha hasta",
      "Fecha hasta anterior a Fecha desde",
    ])
    expect(r.filas).toHaveLength(1)
  })

  it("licencia de maternidad toma la Fecha Final de Lactancia", () => {
    const { filas } = leer([{ ...base, concepto: 122, dias: 126, finLactancia: new Date(2027, 2, 27) }])
    expect(filas[0]).toMatchObject({ tipo: "Licencia de maternidad", finLactancia: "2027-03-27" })
  })
})

describe("prepararCarga", () => {
  it("separa nuevas y duplicadas (contra lo registrado y dentro del archivo, ignorando espacios)", () => {
    const lectura = leer([base, { ...base, nro: "B" }, { ...base, nro: " B" }])
    const v = prepararCarga(lectura, [{ identificacion: "1000", nroIncapacidad: "7003430648", fechaRadicacionNomina: "2026-09-03" }], new Map(), "INCA.xlsx")
    expect(v.nuevas.map((n) => n.nroIncapacidad)).toEqual(["B"])
    expect(v.duplicadas.map((d) => d.contra)).toEqual(["registrada", "archivo"])
    expect(v.nuevas[0]).toMatchObject({ estado: "Radicada", fechaRadicacionNomina: "2026-09-03", origen: "INCA.xlsx" })
    expect(v.paraRevisar).toEqual([])
  })

  it("duplicada con fecha de radicación nómina distinta va a 'para revisar'", () => {
    const v = prepararCarga(leer([base]), [{ identificacion: "1000", nroIncapacidad: "7003430648", fechaRadicacionNomina: "2026-09-01" }], new Map(), "x")
    expect(v.paraRevisar[0]).toMatchObject({ esNueva: false })
    expect(v.paraRevisar[0].motivos[0]).toContain("registrada 2026-09-01, archivo 2026-09-03")
  })

  it("marca para revisar: valor $0, más de 180 días y EPS fuera de lista; pide el fondo", () => {
    const v = prepararCarga(
      leer([
        { ...base, nro: "cero", valor: 0 },
        { ...base, identificacion: 2000, nro: "fondo0", dias: 15, diasTotales: 415, prorrogada: "x", valor: 0 },
        { ...base, identificacion: 3000, nro: "fondo", dias: 30, diasTotales: 305, prorrogada: "x", valor: 1750905 },
        { ...base, nro: "rara", entidad: "CAPRESOCA EPS" },
      ]),
      [],
      new Map([["2000", "Porvenir"]]),
      "x",
    )
    expect(v.paraRevisar.map((p) => [p.nroIncapacidad, p.motivos])).toEqual([
      ["cero", [MOTIVO.valorCero]],
      ["fondo0", [MOTIVO.fondoValorCero]],
      ["fondo", [MOTIVO.fondo]],
      ["rara", [MOTIVO.sinEps]],
    ])
    expect(v.sinEps).toEqual([{ fila: 5, nroIncapacidad: "rara", entidadKactus: "CAPRESOCA EPS" }])
    expect(v.sinFondo).toEqual([{ identificacion: "3000", nombre: "ANA PRUEBA" }])
    expect(v.nuevas).toHaveLength(4) // para revisar se guardan igual, con la marca
  })
})
