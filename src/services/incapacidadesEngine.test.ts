import { describe, it, expect } from "vitest"
import {
  alertasDiasAcumulados,
  calcularCobro,
  construirCadenas,
  diasAcumuladosAlCorte,
  esDiagnosticoLesion,
  fechaLimitePqrd,
  FONDO_SIN_ASIGNAR,
  hoyBogota,
  llaveIncapacidad,
  pqrdVencida,
  proponerEstadoTrasPago,
  resumenCartera,
  sumarMeses,
  tramosCobro,
  vistaMaternidad,
  vistaTransito,
  type IncapacidadCalculada,
} from "./incapacidadesEngine"
import { PARAMETROS_POR_DEFECTO as P, type Incapacidad, type Pago } from "@/src/types/incapacidad"

// Datos sintéticos (no reales) que reproducen las cifras de los criterios de aceptación.
let seq = 0
function inc(over: Partial<Incapacidad> = {}): Incapacidad {
  seq++
  return {
    id: `inc-${seq}`,
    identificacion: "1000",
    nroIncapacidad: `N${seq}`,
    nombre: "COLABORADOR PRUEBA",
    concepto: 121,
    tipo: "Enfermedad general",
    esProrroga: false,
    dias: 3,
    diasAcumulados: 3,
    fechaDesde: "2026-09-01",
    fechaHasta: "2026-09-03",
    fechaRadicacionNomina: "2026-09-10",
    fechaRadicacionEps: null,
    valorIncapacidad: 100_000,
    eps: "SOS",
    valorFondoManual: null,
    estado: "Radicada",
    causalNoPago: null,
    responsable: null,
    observacion: null,
    finLactancia: null,
    sugeridoTransito: false,
    paraRevisar: [],
    origen: null,
    ...over,
  }
}
function pago(incapacidadId: string, valor: number, fechaPago = "2026-10-01", over: Partial<Pago> = {}): Pago {
  return { incapacidadId, tramo: "eps", fechaPago, valor, anulado: false, ...over }
}
const CORTE = "2026-11-04"
const ctx = (over = {}) => ({ params: P, corte: CORTE, fondo: null, ...over })

describe("fechas", () => {
  it("sumarMeses se comporta como EDATE", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28")
    expect(sumarMeses("2026-10-01", 36)).toBe("2029-10-01")
    expect(sumarMeses("2029-05-08", -6)).toBe("2028-11-08")
  })
  it("hoyBogota usa la hora de Colombia aunque sea otro día en UTC", () => {
    expect(hoyBogota(new Date("2026-11-06T03:00:00Z"))).toBe("2026-11-05")
  })
  it("la llave ignora espacios del número", () => {
    expect(llaveIncapacidad(66722409, " 202843 ")).toBe(llaveIncapacidad("66722409", "202843"))
  })
})

describe("pagos de la EPS (RF-03)", () => {
  it("$234.684 sobre $234.694 propone Pagada y la alerta queda Cerrada", () => {
    const i = inc({ valorIncapacidad: 234_694 })
    const pagos = [pago(i.id!, 234_684)]
    expect(proponerEstadoTrasPago(234_694, 234_684, P)).toEqual({ estado: "Pagada", aviso: null })
    const c = calcularCobro({ ...i, estado: "Pagada" }, pagos, ctx())
    expect(c.saldo).toBe(10)
    expect(c.alerta).toBe("Cerrada")
    // Aunque el usuario no cambie el estado, la tolerancia la cierra.
    expect(calcularCobro(i, pagos, ctx()).alerta).toBe("Cerrada")
  })

  it("$174.091 sobre $175.091 confirmado como Pagada parcial: Pago menor al valor con saldo $1.000", () => {
    const i = inc({ valorIncapacidad: 175_091, estado: "Pagada parcial" })
    const c = calcularCobro(i, [pago(i.id!, 174_091)], ctx())
    expect(c.alerta).toBe("Pago menor al valor")
    expect(c.saldo).toBe(1_000)
  })

  it("saldo mayor que la tolerancia propone Pagada parcial; pagado de más avisa", () => {
    expect(proponerEstadoTrasPago(500_000, 400_000, P).estado).toBe("Pagada parcial")
    expect(proponerEstadoTrasPago(450_673, 502_691, P)).toEqual({
      estado: "Pagada",
      aviso: "Pagado mayor al valor registrado: validar",
    })
  })

  it("dos pagos suman y la fecha de pago es la del último", () => {
    const i = inc({ valorIncapacidad: 300_000 })
    const c = calcularCobro(i, [pago(i.id!, 100_000, "2026-10-20"), pago(i.id!, 200_000, "2026-10-05")], ctx())
    expect(c.pagado).toBe(300_000)
    expect(c.fechaUltimoPago).toBe("2026-10-20")
    expect(c.alerta).toBe("Cerrada")
  })

  it("anular un pago recalcula saldo y alerta", () => {
    const i = inc({ valorIncapacidad: 300_000, fechaRadicacionNomina: "2026-08-01" })
    const pagos = [pago(i.id!, 300_000, "2026-10-20", { anulado: true })]
    const c = calcularCobro(i, pagos, ctx())
    expect(c.pagado).toBe(0)
    expect(c.saldo).toBe(300_000)
    expect(c.alerta).toBe("En mora")
  })
})

describe("alerta de cobro", () => {
  it("En mora solo después de 60 días desde la radicación (EPS, si no nómina)", () => {
    expect(calcularCobro(inc({ fechaRadicacionNomina: "2026-09-05" }), [], ctx()).alerta).toBe("Al día") // 60
    expect(calcularCobro(inc({ fechaRadicacionNomina: "2026-09-04" }), [], ctx()).alerta).toBe("En mora") // 61
    const conEps = inc({ fechaRadicacionNomina: "2026-01-01", fechaRadicacionEps: "2026-10-01" })
    expect(calcularCobro(conEps, [], ctx()).diasDesdeRadicacion).toBe(34)
  })

  it("Rechazada: gestionar hasta que se monte una PQRD", () => {
    const i = inc({ estado: "Rechazada", fechaRadicacionNomina: "2026-10-20" })
    expect(calcularCobro(i, [], ctx()).alerta).toBe("Rechazada: gestionar")
    expect(calcularCobro(i, [], ctx({ tienePqrdAbierta: true })).alerta).toBe("Al día")
  })

  it("Riesgo prescripción 6 meses antes de los 36 meses", () => {
    const i = inc({ fechaHasta: "2023-11-04", fechaDesde: "2023-11-01" })
    const c = calcularCobro(i, [], ctx())
    expect(c.fechaPrescripcion).toBe("2026-11-04")
    expect(c.alerta).toBe("Riesgo prescripción")
  })

  it("Castigada, Prescrita y Sin subsidio quedan Cerrada", () => {
    for (const estado of ["Castigada", "Prescrita", "Sin subsidio"]) {
      expect(calcularCobro(inc({ estado }), [], ctx()).alerta).toBe("Cerrada")
    }
    expect(calcularCobro(inc({ estado: "Sin subsidio" }), [], ctx()).valor).toBe(0)
  })
})

describe("cobro desde el día 181", () => {
  it("una incapacidad que empieza después del día 180 se cobra entera al fondo", () => {
    // Caso tipo "462 días, $992.180": no queda en la EPS.
    const i = inc({ eps: "Sura", dias: 17, diasAcumulados: 462, valorIncapacidad: 992_180, esProrroga: true })
    const sinFondo = calcularCobro(i, [], ctx())
    expect(sinFondo.tramos).toEqual([
      { tramo: "fondo", entidad: FONDO_SIN_ASIGNAR, dias: 17, valor: 992_180, pagado: 0, saldo: 992_180 },
    ])
    expect(sinFondo.avisos).toContain("Falta registrar el fondo de pensiones del colaborador")
    const conFondo = calcularCobro(i, [], ctx({ fondo: "Porvenir" }))
    expect(conFondo.tramos[0].entidad).toBe("Porvenir")
    expect(conFondo.valor).toBe(992_180)
  })

  it("si cruza el día 180 (177→192) se divide entre EPS y fondo", () => {
    const i = inc({ dias: 15, diasAcumulados: 192, valorIncapacidad: 1_500_000, esProrroga: true })
    const t = tramosCobro(i, [], "Colpensiones")
    expect(t.map((x) => [x.tramo, x.dias, x.valor])).toEqual([
      ["eps", 3, 300_000],
      ["fondo", 12, 1_200_000],
    ])
    const manual = tramosCobro({ ...i, valorFondoManual: 900_000 }, [], "Colpensiones")
    expect(manual.map((x) => x.valor)).toEqual([600_000, 900_000])
  })

  it("más de 180 días con valor $0 avisa que falta el valor del fondo", () => {
    const i = inc({ dias: 15, diasAcumulados: 415, valorIncapacidad: 0, esProrroga: true })
    expect(calcularCobro(i, [], ctx({ fondo: "Porvenir" })).avisos).toContain(
      "Falta digitar el valor a cobrar al fondo de pensiones",
    )
  })

  it("no aplica a licencias ni a accidentes de trabajo", () => {
    const lic = inc({ tipo: "Licencia de maternidad", dias: 126, diasAcumulados: 200 })
    expect(tramosCobro(lic, [], null).map((t) => t.tramo)).toEqual(["eps"])
  })
})

describe("alertas de días acumulados", () => {
  const params = P
  function cadena(id: string, tramos: [number, string, string][], over: Partial<Incapacidad> = {}) {
    // tramos: [diasAcumulados, desde, hasta]
    let previo = 0
    return tramos.map(([acum, desde, hasta], idx) => {
      const r = inc({
        identificacion: id,
        nroIncapacidad: `${id}-${idx}`,
        esProrroga: idx > 0,
        dias: acum - previo,
        diasAcumulados: acum,
        fechaDesde: desde,
        fechaHasta: hasta,
        ...over,
      })
      previo = acum
      return r
    })
  }
  const hitosDe = (incs: Incapacidad[], fondos = new Map<string, string>()) =>
    alertasDiasAcumulados(incs, { params, corte: CORTE, fondos }).map((a) => `${a.tipo}:${a.hito}`)

  it("93 días → alerta de 90", () => {
    expect(hitosDe(cadena("A", [[63, "2026-01-01", "2026-03-04"], [93, "2026-03-05", "2026-04-03"]]))).toEqual(["hito:90"])
  })

  it("160 días → 90, 120 y 150, no 180", () => {
    expect(hitosDe(cadena("B", [[100, "2026-01-01", "2026-04-10"], [160, "2026-04-11", "2026-06-09"]]))).toEqual([
      "hito:90", "hito:120", "hito:150",
    ])
  })

  it("462 días → los cuatro hitos; sin fondo la de 180 lo pide", () => {
    const incs = cadena("C", [[300, "2025-07-01", "2026-04-26"], [462, "2026-04-27", "2026-10-05"]])
    const alertas = alertasDiasAcumulados(incs, { params, corte: CORTE, fondos: new Map() })
    expect(alertas.map((a) => a.hito)).toEqual([90, 120, 150, 180])
    expect(alertas[3].accionSugerida).toContain("Falta registrar el fondo de pensiones")
  })

  it("72 días → ninguna; 76 días → solo la previa del día 90", () => {
    expect(hitosDe(cadena("D", [[72, "2026-06-01", "2026-08-11"]]))).toEqual([])
    expect(hitosDe(cadena("E", [[76, "2026-06-01", "2026-08-15"]]))).toEqual(["previa:90"])
  })

  it("una licencia de maternidad de 126 días no genera alerta", () => {
    expect(hitosDe([inc({ tipo: "Licencia de maternidad", dias: 126, diasAcumulados: 126 })])).toEqual([])
  })

  it("si una carga salta de 85 a 125 días se generan la de 90 y la de 120", () => {
    expect(hitosDe(cadena("F", [[85, "2026-01-01", "2026-03-26"], [125, "2026-03-27", "2026-05-05"]]))).toEqual([
      "hito:90", "hito:120",
    ])
  })

  it("una incapacidad que no es prórroga reinicia la cadena", () => {
    const incs = [
      ...cadena("G", [[100, "2025-01-01", "2025-04-10"]]),
      inc({ identificacion: "G", nroIncapacidad: "nueva", dias: 10, diasAcumulados: 10, fechaDesde: "2026-10-01", fechaHasta: "2026-10-10" }),
    ]
    expect(construirCadenas(incs)).toHaveLength(2)
    expect(hitosDe(incs)).toEqual(["hito:90"]) // solo de la cadena vieja
  })

  it("las claves son estables: recargar los mismos datos no crea alertas nuevas", () => {
    const incs = cadena("H", [[95, "2026-01-01", "2026-04-05"]])
    const a = alertasDiasAcumulados(incs, { params, corte: CORTE, fondos: new Map() }).map((x) => x.clave)
    const b = alertasDiasAcumulados([...incs], { params, corte: "2026-11-05", fondos: new Map() }).map((x) => x.clave)
    expect(b).toEqual(a)
  })

  it("en una incapacidad en curso solo cuentan los días ya transcurridos", () => {
    const i = inc({ dias: 30, diasAcumulados: 100, fechaDesde: "2026-10-26", fechaHasta: "2026-11-24", esProrroga: true })
    expect(diasAcumuladosAlCorte(i, CORTE)).toBe(80)
    expect(diasAcumuladosAlCorte(i, "2026-10-01")).toBe(70)
  })
})

describe("vistas", () => {
  const calc = (incs: Incapacidad[]): IncapacidadCalculada[] => incs.map((i) => ({ inc: i, cobro: calcularCobro(i, [], ctx()) }))

  it("tránsito: dos incapacidades de 21 días suman 42 y faltan 138 para 180", () => {
    const a = inc({ identificacion: "T", tipo: "Accidente de tránsito", dias: 21, diasAcumulados: 21, fechaDesde: "2026-09-19", fechaHasta: "2026-10-09" })
    const b = inc({ identificacion: "T", tipo: "Accidente de tránsito", dias: 21, diasAcumulados: 42, esProrroga: true, fechaDesde: "2026-10-10", fechaHasta: "2026-10-30" })
    const { filas, indicadores } = vistaTransito(calc([a, b]), CORTE, P)
    const ultima = filas.find((f) => f.registroMasReciente)!
    expect(ultima.diasAcumulados).toBe(42)
    expect(ultima.diasPara180).toBe(138)
    expect(ultima.fechaDia180).toBe("2027-03-17") // 30/10/2026 + 138 días
    expect(filas.find((f) => !f.registroMasReciente)!.estado).toBe("Histórico (ver registro más reciente)")
    expect(indicadores.colaboradores).toBe(1)
  })

  it("tránsito: sugiere candidatos con lesión y 30+ días", () => {
    const items = calc([
      inc({ identificacion: "S1", sugeridoTransito: true, dias: 40, diasAcumulados: 40, fechaDesde: "2026-08-01", fechaHasta: "2026-09-09" }),
      inc({ identificacion: "S2", sugeridoTransito: true, dias: 10, diasAcumulados: 10 }),
      inc({ identificacion: "S3", sugeridoTransito: false, dias: 90, diasAcumulados: 90 }),
    ])
    expect(vistaTransito(items, CORTE, P).candidatos.map((c) => c.identificacion)).toEqual(["S1"])
  })

  it("maternidad: 28/09/2026–31/01/2027 reintegra el 01/02/2027 y toma la lactancia de KactuS", () => {
    const lic = inc({ tipo: "Licencia de maternidad", dias: 126, diasAcumulados: 126, fechaDesde: "2026-09-28", fechaHasta: "2027-01-31", finLactancia: "2027-03-27" })
    const { filas, indicadores } = vistaMaternidad(calc([lic]), CORTE)
    expect(filas[0].fechaReintegro).toBe("2027-02-01")
    expect(filas[0].finLactancia).toBe("2027-03-27")
    expect(filas[0].estado).toBe("En curso")
    expect(filas[0].diasRestantes).toBe(88)
    expect(indicadores.enCurso).toBe(1)
    const sinLactancia = vistaMaternidad(calc([{ ...lic, finLactancia: null }]), CORTE)
    expect(sinLactancia.filas[0].finLactancia).toBe("2027-03-28")
  })
})

describe("PQRD", () => {
  it("la fecha límite cuenta 15 días hábiles saltando fines de semana y festivos", () => {
    // 2026-11-02 (lun) y 2026-11-16 (lun) son festivos en Colombia.
    expect(fechaLimitePqrd("2026-10-30", P)).toBe("2026-11-24")
  })
  it("abierta y vencida genera 'PQRD sin respuesta'; respondida no", () => {
    expect(pqrdVencida({ estado: "Abierta", fechaLimite: "2026-11-24" }, "2026-11-25")).toBe(true)
    expect(pqrdVencida({ estado: "Abierta", fechaLimite: "2026-11-24" }, "2026-11-24")).toBe(false)
    expect(pqrdVencida({ estado: "Respondida a favor", fechaLimite: "2026-11-01" }, "2026-11-25")).toBe(false)
  })
})

describe("resumen de cartera", () => {
  it("totales cuadran con entidades y estados; fondo sin asignar sale en el control", () => {
    const a = inc({ valorIncapacidad: 500_000, estado: "Pagada" })
    const b = inc({ valorIncapacidad: 300_000, eps: "EPS Desconocida" })
    const c = inc({ dias: 15, diasAcumulados: 192, valorIncapacidad: 150_000, esProrroga: true })
    const items: IncapacidadCalculada[] = [
      { inc: a, cobro: calcularCobro(a, [pago(a.id!, 500_000)], ctx()) },
      { inc: b, cobro: calcularCobro(b, [], ctx()) },
      { inc: c, cobro: calcularCobro(c, [], ctx()) },
    ]
    const r = resumenCartera(items, P)
    expect(r.totales).toMatchObject({ valor: 950_000, pagado: 500_000, saldo: 450_000 })
    expect(r.inconsistencias).toEqual([])
    expect(r.porEntidad.find((f) => f.entidad === FONDO_SIN_ASIGNAR)!.valor).toBe(120_000)
    expect(r.valorFueraDeLista).toBe(300_000 + 120_000)
    expect(r.porEstado.find((f) => f.estado === "Pagada")!.incapacidades).toBe(1)
  })
})

describe("diagnóstico", () => {
  it("S, T, V–Y son lesiones; el resto no", () => {
    expect(["S099", "T14", "V892", "Y00"].every(esDiagnosticoLesion)).toBe(true)
    expect(["A099", "O364", "", null].some(esDiagnosticoLesion)).toBe(false)
  })
})
