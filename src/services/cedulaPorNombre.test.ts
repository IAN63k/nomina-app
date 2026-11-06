import { describe, it, expect } from "vitest"
import { crearIndiceCedulas, SIN_CEDULA } from "./cedulaPorNombre"

const indice = crearIndiceCedulas([
  { nombre: "LUCIA RENGIFO SOLARTE", cedula: "1001" },
  { nombre: "HERNAN DARIO MUÑOZ QUINTERO", cedula: "1002" },
  { nombre: "MARIA JOSE PEREZ GOMEZ", cedula: "1003" },
  { nombre: "MARIA PEREZ RUIZ", cedula: "1004" },
  { nombre: "OSCAR LEMOS PATIÑO", cedula: "1005" },
])

describe("cruce nombre → cédula", () => {
  it("nombre completo, sin importar tildes, mayúsculas ni espacios", () => {
    expect(indice.buscar("  lucia   rengifo SOLARTÉ ")).toBe("1001")
    expect(indice.buscar("Oscar Lemos Patino")).toBe("1005")
  })

  it("mismas palabras en distinto orden", () => {
    expect(indice.buscar("RENGIFO SOLARTE LUCIA")).toBe("1001")
  })

  it("nombre abreviado con un único colaborador que lo contiene", () => {
    expect(indice.buscar("Lucia Rengifo")).toBe("1001")
    expect(indice.buscar("Hernan Muñoz")).toBe("1002")
  })

  it("no adivina si el abreviado es ambiguo, de una sola palabra o tiene errores", () => {
    expect(indice.buscar("Maria Perez")).toBe(SIN_CEDULA) // 1003 y 1004
    expect(indice.buscar("Lucia")).toBe(SIN_CEDULA)
    expect(indice.buscar("Hernan Munos")).toBe(SIN_CEDULA)
    expect(indice.buscar("M")).toBe(SIN_CEDULA)
    expect(indice.buscar("")).toBe(SIN_CEDULA)
  })
})
