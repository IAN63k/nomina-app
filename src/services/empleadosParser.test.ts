import { describe, it, expect } from "vitest"
import { parseEmpleadosMatriz } from "./empleadosParser"

describe("parseEmpleadosMatriz", () => {
  it("lee Nombre, Cédula, Cargo y Sede en cualquier orden", () => {
    const r = parseEmpleadosMatriz([
      ["Cargo", "Cédula", "Nombre", "Sede"],
      ["Médico general", "1.234.567.890", " ANA  PÉREZ ", "Cali"],
    ])
    expect(r.colaboradores).toEqual([{ cedula: "1234567890", nombre: "ANA PÉREZ", cargo: "Médico general", sede: "Cali", fondoPensiones: null }])
  })

  it("no confunde 'Dirección' con la cédula ni 'Control' con el cargo", () => {
    const r = parseEmpleadosMatriz([
      ["Nombre", "Dirección", "Control", "Cédula"],
      ["ANA", "Cra 1 # 2-3", "X", 1000],
    ])
    expect(r.colaboradores[0]).toEqual({ cedula: "1000", nombre: "ANA", cargo: null, sede: null, fondoPensiones: null })
    expect(r.columnas).toMatchObject({ cedula: "Cédula", nombre: "Nombre" })
  })

  it("une Nombres + Apellidos y reconoce 'Id. Empleado' como cédula", () => {
    const r = parseEmpleadosMatriz([
      ["Id. Empleado", "Nombres", "Apellidos", "Nombre Centro Costo", "Tipo Documento"],
      [1234500001, "MARIA FERNANDA", "LOPEZ RIASCOS", "SEDE CALI", "CC"],
    ])
    expect(r.colaboradores[0]).toMatchObject({ cedula: "1234500001", nombre: "MARIA FERNANDA LOPEZ RIASCOS" })
  })

  it("nunca extrae columnas fuera de la lista blanca (salario, teléfono…)", () => {
    const r = parseEmpleadosMatriz([
      ["Nombre", "Cédula", "Salario", "Teléfono", "Cargo"],
      ["ANA", "1000", 3500000, "3001234567", "Auxiliar"],
    ])
    expect(Object.keys(r.colaboradores[0]).sort()).toEqual(["cargo", "cedula", "fondoPensiones", "nombre", "sede"])
    expect(JSON.stringify(r)).not.toContain("3500000")
  })

  it("lee el reporte KactuS KNmContr: Clase Nómina = sede y Pension = fondo", () => {
    const r = parseEmpleadosMatriz([
      ["Identificación", "nombre", "cargo", "Descripción Clase Nómina", "Pension"],
      [1234500002, "JUAN CAMILO ROJAS", "GERENTE", "SEDE NORTE", "PROTECCION"],
    ])
    expect(r.colaboradores[0]).toEqual({
      cedula: "1234500002", nombre: "JUAN CAMILO ROJAS", cargo: "GERENTE", sede: "SEDE NORTE", fondoPensiones: "PROTECCION",
    })
  })

  it("encuentra el encabezado aunque haya filas de título arriba", () => {
    const r = parseEmpleadosMatriz([["LISTADO DE PERSONAL"], [], ["Nombre", "Cédula"], ["ANA", "1000"]])
    expect(r.colaboradores).toHaveLength(1)
  })

  it("omite filas sin nombre o con cédula inválida y reporta cédulas repetidas", () => {
    const r = parseEmpleadosMatriz([
      ["Nombre", "Cédula"],
      ["ANA", "1000"],
      ["", "2000"],
      ["LUIS", "N/A"],
      ["ANA MARÍA", "1000"],
      ["", ""],
    ])
    expect(r.colaboradores).toEqual([{ cedula: "1000", nombre: "ANA MARÍA", cargo: null, sede: null, fondoPensiones: null }])
    expect(r.omitidas.map((o) => o.motivo)).toEqual(["Sin nombre", 'Cédula inválida: "N/A"'])
    expect(r.duplicadas).toEqual(["1000"])
  })

  it("sin encabezados acepta Nombre, Cédula, Cargo por posición solo si parece dato", () => {
    expect(parseEmpleadosMatriz([["ANA", 1000, "Médico"]]).colaboradores).toHaveLength(1)
    expect(() => parseEmpleadosMatriz([["Foo", "Bar"], ["x", "y"]])).toThrow(/Nombre y Cédula/)
  })
})
