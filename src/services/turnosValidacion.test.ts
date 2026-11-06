import { describe, it, expect } from "vitest"
import { validarFilasTurnos, validarPreferencia, validarTurnoCatalogo, MAX_FILAS_POR_LOTE } from "./turnosValidacion"

const fila = (over: Record<string, unknown> = {}) => ({
  medico: "MEDICO PRUEBA", documento: null, fecha: "2026-10-02", fechaInicio: "2026-10-01", turno_codigo: "N",
  entrada: "00:00:00", salida: "06:00", concepto: 36, horas: 6, horasrecargo: 5, diferencia: -1, dia: "H",
  mes: 10, dia_numero: 2, festivo: true, created_at: "x", turnoTrabajado: "20:00-06:00", ...over,
})
const error = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error)

describe("filas de turnos", () => {
  it("convierte al formato de BD con lista blanca (festivo solo en auxiliares)", () => {
    const m = validarFilasTurnos({ filas: [fila()] }, "medicos")
    expect(m).toEqual({
      ok: true,
      valor: [{
        medico: "MEDICO PRUEBA", documento: null, fecha: "2026-10-02", fecha_inicio: "2026-10-01", turno_codigo: "N",
        entrada: "00:00:00", salida: "06:00", concepto: 36, horas: 6, horasrecargo: 5, diferencia: -1, dia: "H", mes: 10, dia_numero: 2,
      }],
    })
    const a = validarFilasTurnos({ filas: [fila()] }, "auxiliares")
    expect(a.ok && a.valor[0].festivo).toBe(true)
  })

  it("acepta horas de un dígito, 24:00, entrada vacía y sin fechaInicio (usa fecha)", () => {
    const r = validarFilasTurnos({ filas: [fila({ entrada: "6:00", salida: "24:00" }), fila({ entrada: "", salida: null, turno_codigo: "", fechaInicio: undefined })] }, "medicos")
    expect(r.ok).toBe(true)
    expect(r.ok && r.valor[1]).toMatchObject({ entrada: null, salida: null, fecha_inicio: "2026-10-02" })
  })

  it.each([
    [{ medico: "" }, "nombre"],
    [{ fecha: "02/10/2026" }, "fecha"],
    [{ entrada: "6am" }, "hora"],
    [{ concepto: 1.5 }, "entero"],
    [{ horas: "6" }, "número"],
    [{ dia: "X" }, "día"],
    [{ mes: 13 }, "rango"],
  ])("rechaza %j", (over, mensaje) => {
    expect(error(validarFilasTurnos({ filas: [fila(over)] }, "medicos"))).toContain(mensaje)
  })

  it("exige lotes no vacíos y limitados", () => {
    expect(error(validarFilasTurnos({ filas: [] }, "medicos"))).toContain("No hay filas")
    expect(error(validarFilasTurnos({ filas: Array(MAX_FILAS_POR_LOTE + 1).fill(fila()) }, "medicos"))).toContain("Máximo")
  })
})

describe("catálogo de turnos", () => {
  it("acepta la forma de los turnos personalizados reales", () => {
    expect(validarTurnoCatalogo({ codigo: "ETN", config: { entrada: "20:00", salida: "1:00", total: "5", descripcion: "Extra noche" } }).ok).toBe(true)
    expect(validarTurnoCatalogo({ codigo: "MT", config: { entrada: "6:00", salida: "20:00", total: "14", descripcion: "" } }).ok).toBe(true)
  })
  it("rechaza códigos y horas inválidos", () => {
    expect(error(validarTurnoCatalogo({ codigo: "<x>", config: { entrada: "", salida: "", total: "", descripcion: "" } }))).toContain("Código")
    expect(error(validarTurnoCatalogo({ codigo: "X", config: { entrada: "seis", salida: "", total: "", descripcion: "" } }))).toContain("HH:MM")
  })
})

describe("preferencias", () => {
  it("solo claves permitidas y objetos pequeños", () => {
    expect(validarPreferencia({ clave: "recargos-detail:medicos", valor: { pageSize: 50 } }).ok).toBe(true)
    expect(error(validarPreferencia({ clave: "otra", valor: {} }))).toContain("no permitida")
    expect(error(validarPreferencia({ clave: "recargos-detail:medicos", valor: { x: "a".repeat(9000) } }))).toContain("grande")
  })
})
