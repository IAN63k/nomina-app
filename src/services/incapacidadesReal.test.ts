/**
 * Criterios de aceptación con los archivos reales. Los Excel tienen datos
 * personales y de salud (Ley 1581), así que NO están en el repo: copie
 * "Seguimiento_Incapacidades_2026.xlsx" como test-fixtures/private/seguimiento.xlsx
 * y "INCA DE SEP A OCT 26.xlsx" como test-fixtures/private/kactus.xlsx.
 * Sin ellos estas pruebas se saltan.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { leerKactus, prepararCarga, type RegistroExistente } from "./incapacidadesParser"
import { leerCandidatosTransitoLibro, leerLibroSeguimiento, type FilaLibro } from "./seguimientoLibroParser"
import { prepararMigracion } from "./incapacidadesMigracion"
import {
  alertasDiasAcumulados,
  calcularCobro,
  FONDO_SIN_ASIGNAR,
  resumenCartera,
  vistaMaternidad,
  vistaTransito,
  type IncapacidadCalculada,
} from "./incapacidadesEngine"
import { PARAMETROS_POR_DEFECTO, type Incapacidad, type Pago } from "@/src/types/incapacidad"

const DIR = path.resolve(__dirname, "../../test-fixtures/private")
const KACTUS = path.join(DIR, "kactus.xlsx")
const LIBRO = path.join(DIR, "seguimiento.xlsx")
const hayDatos = fs.existsSync(KACTUS) && fs.existsSync(LIBRO)

const CORTE = "2026-11-04" // fecha de corte del libro
const P = { ...PARAMETROS_POR_DEFECTO, fechaCorte: CORTE }
const ORIGEN_ARCHIVO = "Origen: INCA DE SEP A OCT 26"

function cargarLibro(): FilaLibro[] {
  const r = leerLibroSeguimiento(new Uint8Array(fs.readFileSync(LIBRO)))
  if (!r.ok) throw new Error(r.error)
  return r.filas
}
function lecturaKactus() {
  const r = leerKactus(new Uint8Array(fs.readFileSync(KACTUS)), "INCA DE SEP A OCT 26.xlsx", P)
  if (!r.ok) throw new Error(r.error)
  return r
}
const existente = (i: Incapacidad): RegistroExistente => ({
  identificacion: i.identificacion,
  nroIncapacidad: i.nroIncapacidad,
  fechaRadicacionNomina: i.fechaRadicacionNomina,
})

/** Pago del libro como un pago único (la migración lo hará igual). */
function pagosDe(f: FilaLibro, id: string): Pago[] {
  if (f.valorPagado === null) return []
  return [{ incapacidadId: id, tramo: "eps", fechaPago: f.fechaPago ?? f.inc.fechaHasta, valor: f.valorPagado, anulado: false }]
}

function calcular(filas: FilaLibro[], fondos = new Map<string, string>()): IncapacidadCalculada[] {
  return filas.map((f, i) => {
    const inc = { ...f.inc, id: `r${i}` }
    return { inc, cobro: calcularCobro(inc, pagosDe(f, inc.id), { params: P, corte: CORTE, fondo: fondos.get(inc.identificacion) ?? null }) }
  })
}

describe.skipIf(!hayDatos)("datos reales: libro de Seguimiento", () => {
  it("489 incapacidades con los totales del Resumen del Excel", () => {
    const filas = cargarLibro()
    expect(filas).toHaveLength(489)
    const r = resumenCartera(calcular(filas), P)
    expect(r.totales).toMatchObject({ valor: 539_275_156, pagado: 409_757_506, saldo: 129_517_650 })
    expect(r.inconsistencias).toEqual([])
  })

  it("el motor da la misma alerta de cobro que el Excel en cada fila", () => {
    const filas = cargarLibro()
    const items = calcular(filas)
    const distintas = items
      .map((x, i) => ({ fila: filas[i].fila, nro: x.inc.nroIncapacidad, excel: filas[i].excel.alerta, app: x.cobro.alerta }))
      .filter((d) => d.excel !== d.app)
    expect(distintas).toEqual([])
    const r = resumenCartera(items, P)
    expect(r.conteos).toMatchObject({ enMora: 54, riesgoPrescripcion: 0, rechazadasPorGestionar: 14, pagoMenor: 58, saldoPagoMenor: 18_079_654 })
  })

  it("la incapacidad 61026 (462 días, $992.180) se cobra al fondo, no a Sura", () => {
    const items = calcular(cargarLibro())
    const x = items.find((i) => i.inc.nroIncapacidad === "61026")!
    expect(x.cobro.tramos).toEqual([expect.objectContaining({ tramo: "fondo", entidad: FONDO_SIN_ASIGNAR, valor: 992_180 })])
    const conFondo = calcular(cargarLibro(), new Map([[x.inc.identificacion, "Porvenir"]]))
    const porvenir = resumenCartera(conFondo, P).porEntidad.find((f) => f.entidad === "Porvenir")!
    expect(porvenir.valor).toBeGreaterThanOrEqual(992_180)
  })
})

describe.skipIf(!hayDatos)("datos reales: carga de KactuS", () => {
  it("sobre el estado previo (441) agrega 48 nuevas, marca 22 duplicadas y no rechaza ninguna", () => {
    const libro = cargarLibro()
    const previo = libro.filter((f) => !(f.inc.observacion ?? "").includes(ORIGEN_ARCHIVO))
    expect(previo).toHaveLength(441)

    const v = prepararCarga(lecturaKactus(), previo.map((f) => existente(f.inc)), new Map(), "INCA DE SEP A OCT 26.xlsx")
    expect(v.nuevas).toHaveLength(48)
    expect(v.duplicadas).toHaveLength(22)
    expect(v.rechazadas).toHaveLength(0)
    expect(v.sinEps).toEqual([])
    expect(v.nuevas.every((n) => n.estado === "Radicada" && n.fechaRadicacionNomina !== null)).toBe(true)

    // Las nuevas son exactamente las que el libro marca con ese origen.
    const esperadas = new Set(libro.filter((f) => (f.inc.observacion ?? "").includes(ORIGEN_ARCHIVO)).map((f) => `${f.inc.identificacion}|${f.inc.nroIncapacidad}`))
    expect(new Set(v.nuevas.map((n) => `${n.identificacion}|${n.nroIncapacidad}`))).toEqual(esperadas)

    // Para revisar: PR-7757928 ($0) y 11026 (305 días con $1.750.905).
    const revisar = v.paraRevisar.filter((p) => p.esNueva).map((p) => p.nroIncapacidad)
    expect(revisar).toEqual(expect.arrayContaining(["PR-7757928", "11026"]))
  })

  it("cargar el mismo archivo dos veces no agrega nada la segunda vez", () => {
    const previo = cargarLibro().filter((f) => !(f.inc.observacion ?? "").includes(ORIGEN_ARCHIVO)).map((f) => existente(f.inc))
    const primera = prepararCarga(lecturaKactus(), previo, new Map(), "x")
    const segunda = prepararCarga(lecturaKactus(), [...previo, ...primera.nuevas.map(existente)], new Map(), "x")
    expect(segunda.nuevas).toHaveLength(0)
    expect(segunda.duplicadas).toHaveLength(70)
  })

  it("licencia del 28/09/2026 al 31/01/2027: reintegro 01/02/2027 y lactancia 27/03/2027 (de KactuS)", () => {
    const v = prepararCarga(lecturaKactus(), [], new Map(), "x")
    const lic = v.nuevas.find((n) => n.tipo === "Licencia de maternidad" && n.fechaDesde === "2026-09-28")!
    const items = [{ inc: lic, cobro: calcularCobro(lic, [], { params: P, corte: CORTE, fondo: null }) }]
    const fila = vistaMaternidad(items, CORTE).filas[0]
    expect(fila.fechaReintegro).toBe("2027-02-01")
    expect(fila.finLactancia).toBe("2027-03-27")
  })
})

describe.skipIf(!hayDatos)("datos reales: migración", () => {
  const plan = () => {
    const datos = new Uint8Array(fs.readFileSync(LIBRO))
    const r = leerLibroSeguimiento(datos)
    if (!r.ok) throw new Error(r.error)
    const sugeridos = new Set(
      leerCandidatosTransitoLibro(datos).flatMap((c) => {
        const f = r.filas.find((x) => x.inc.identificacion === c.identificacion && x.inc.fechaHasta === c.ultimaFechaHasta)
        return f ? [`${f.inc.identificacion}|${f.inc.nroIncapacidad}`] : []
      }),
    )
    return prepararMigracion(r.filas, { fechaMigracion: "2026-11-05", kactus: lecturaKactus().filas, sugeridosTransito: sugeridos })
  }

  it("deja 489 incapacidades con los totales del libro y sin errores", () => {
    const p = plan()
    expect(p.errores).toEqual([])
    expect(p.incapacidades).toHaveLength(489)
    expect(p.pagos).toHaveLength(340)
    const pagos = new Map(p.pagos.map((x) => [`${x.identificacion}|${x.nroIncapacidad}`, x]))
    const items = p.incapacidades.map((inc) => {
      const pg = pagos.get(`${inc.identificacion}|${inc.nroIncapacidad}`)
      const lista: Pago[] = pg ? [{ incapacidadId: "x", tramo: pg.tramo, fechaPago: pg.fechaPago, valor: pg.valor, anulado: false }] : []
      return { inc, cobro: calcularCobro(inc, lista, { params: P, corte: CORTE, fondo: null }) }
    })
    expect(resumenCartera(items, P).totales).toMatchObject({ valor: 539_275_156, pagado: 409_757_506, saldo: 129_517_650 })
  })

  it("aplica las reglas: 17 Sin subsidio → fondo y 4 rechazadas por rehabilitación → Sin subsidio", () => {
    const p = plan()
    expect(p.cambios.filter((c) => c.regla === "sin_subsidio_a_fondo")).toHaveLength(17)
    expect(p.cambios.filter((c) => c.regla === "rehabilitacion_a_sin_subsidio").map((c) => c.nroIncapacidad).sort()).toEqual(
      ["1002953622", "14574587", "14683015", "290379"],
    )
    expect(p.incapacidades.filter((i) => i.estado === "Sin subsidio")).toHaveLength(4)
  })

  it("toma la lactancia de KactuS y marca para revisar PR-7757928", () => {
    const p = plan()
    expect(p.incapacidades.find((i) => i.tipo === "Licencia de maternidad" && i.fechaDesde === "2026-09-28")!.finLactancia).toBe("2027-03-27")
    expect(p.incapacidades.find((i) => i.nroIncapacidad === "PR-7757928")!.paraRevisar).toEqual(["Valor incapacidad en $0"])
    expect(p.incapacidades.find((i) => i.nroIncapacidad === "61026")!.paraRevisar).toEqual([
      "Supera 180 días: se cobra al fondo de pensiones (verificar fondo y valor)",
    ])
  })
})

describe.skipIf(!hayDatos)("datos reales: alertas y vistas", () => {
  const alertasPor = (incs: Incapacidad[], nro: string) => {
    const id = incs.find((i) => i.nroIncapacidad === nro)!.identificacion
    return alertasDiasAcumulados(incs, { params: P, corte: CORTE, fondos: new Map() })
      .filter((a) => a.identificacion === id)
      .map((a) => `${a.tipo}:${a.hito}`)
  }
  const incs = () => cargarLibro().map((f) => f.inc)

  it("93 días (cadena de 2026022311034534) → alerta de 90", () => {
    expect(alertasPor(incs(), "2026022311034534")).toEqual(["hito:90"])
  })
  it("160 días (cadena de 14683015) → 90, 120 y 150; no 180", () => {
    expect(alertasPor(incs(), "14683015")).toEqual(["hito:90", "hito:120", "hito:150"])
  })
  it("462 días (61026) y 305 días (11026) → todos los hitos", () => {
    expect(alertasPor(incs(), "61026")).toEqual(["hito:90", "hito:120", "hito:150", "hito:180"])
    expect(alertasPor(incs(), "11026")).toEqual(["hito:90", "hito:120", "hito:150", "hito:180"])
  })
  it("72 días (cadena de 552698) → ninguna alerta", () => {
    expect(alertasPor(incs(), "552698")).toEqual([])
  })
  it("ninguna licencia de maternidad genera alerta", () => {
    const todas = incs()
    const conLicencia = new Set(todas.filter((i) => i.tipo === "Licencia de maternidad").map((i) => i.identificacion))
    const soloLicencia = [...conLicencia].filter((id) => todas.filter((i) => i.identificacion === id).every((i) => i.tipo === "Licencia de maternidad"))
    const alertas = alertasDiasAcumulados(todas, { params: P, corte: CORTE, fondos: new Map() })
    expect(alertas.filter((a) => soloLicencia.includes(a.identificacion))).toEqual([])
  })

  it("marcar 207373 y 554641 como tránsito: 42 días acumulados y 138 para 180", () => {
    const items = calcular(cargarLibro()).map((x) =>
      ["207373", "554641"].includes(x.inc.nroIncapacidad) ? { ...x, inc: { ...x.inc, tipo: "Accidente de tránsito" } } : x,
    )
    const fila = vistaTransito(items, CORTE, P).filas.find((f) => f.registroMasReciente)!
    expect(fila.item.inc.nroIncapacidad).toBe("554641")
    expect(fila.diasAcumulados).toBe(42)
    expect(fila.diasPara180).toBe(138)
  })
})

describe.skipIf(!hayDatos)("datos reales: exportación a Excel", () => {
  it("abre sin errores y sus totales coinciden con el Resumen (539.275.156 / 409.757.506 / 129.517.650)", async () => {
    const XLSX = await import("xlsx")
    const { construirLibro, libroABytes } = await import("./incapacidadesExport")
    const wb = XLSX.read(libroABytes(construirLibro(calcular(cargarLibro()), P, CORTE)), { type: "array" })
    const res = wb.Sheets.Resumen
    expect([res.B4.v, res.B5.v, res.B6.v]).toEqual([539_275_156, 409_757_506, 129_517_650])
    expect(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Seguimiento, { header: 1 }).slice(4)).toHaveLength(489)
  })
})
