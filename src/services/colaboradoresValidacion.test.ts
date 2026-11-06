import { describe, it, expect } from "vitest"
import { normalizarFondo, validarEdicion, validarImportacion } from "./colaboradoresValidacion"

const FONDOS = ["Colpensiones", "Porvenir", "Protección", "Colfondos", "Skandia"]

describe("validarImportacion", () => {
  it("descarta campos fuera de la lista blanca y limpia la cédula", () => {
    const r = validarImportacion({
      archivo: "lista.xlsx",
      colaboradores: [{ cedula: "1.000.200", nombre: " ANA  PÉREZ ", cargo: "", sede: "Cali", salario: 3_500_000 }],
    }, FONDOS)
    expect(r).toEqual({
      ok: true,
      valor: {
        archivo: "lista.xlsx",
        colaboradores: [{ cedula: "1000200", nombre: "ANA PÉREZ", cargo: null, sede: "Cali", fondoPensiones: null }],
        fondosNoReconocidos: [],
      },
    })
  })

  it("deduplica por cédula (la última gana) para que el upsert no falle", () => {
    const r = validarImportacion({ colaboradores: [{ cedula: "1000", nombre: "A" }, { cedula: "1000", nombre: "B" }] }, FONDOS)
    expect(r.ok && r.valor.colaboradores).toEqual([{ cedula: "1000", nombre: "B", cargo: null, sede: null, fondoPensiones: null }])
  })

  it.each([
    [{}, "No hay colaboradores"],
    [{ colaboradores: [] }, "No hay colaboradores"],
    [{ colaboradores: [{ cedula: "12", nombre: "A" }] }, "cédula inválida"],
    [{ colaboradores: [{ cedula: 1000, nombre: "A" }] }, "cédula inválida"],
    [{ colaboradores: [{ cedula: "1000", nombre: "" }] }, "sin nombre"],
    [{ colaboradores: [{ cedula: "1000", nombre: "x".repeat(201) }] }, "supera"],
    [{ colaboradores: [{ cedula: "1000", nombre: "A", cargo: 5 }] }, "debe ser texto"],
  ])("rechaza %j", (body, mensaje) => {
    const r = validarImportacion(body, FONDOS)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain(mensaje)
  })
})

describe("fondo de pensiones en la importación", () => {
  it.each([
    ["PORVENIR", "Porvenir"],
    ["COLPENSIONES", "Colpensiones"],
    ["PROTECCION", "Protección"],
    ["COLFONDOS", "Colfondos"],
    ["SKANDIA FONDO DE PENSIONES OBLIGATORIAS", "Skandia"],
  ])("%s → %s", (texto, fondo) => {
    expect(normalizarFondo(texto, FONDOS)).toBe(fondo)
  })

  it("un fondo desconocido no se guarda y se reporta", () => {
    const r = validarImportacion({ colaboradores: [{ cedula: "1000", nombre: "A", fondoPensiones: "FONDO RARO" }] }, FONDOS)
    expect(r.ok && r.valor.colaboradores[0].fondoPensiones).toBeNull()
    expect(r.ok && r.valor.fondosNoReconocidos).toEqual(["FONDO RARO"])
  })
})

describe("validarEdicion", () => {
  it("acepta un fondo de la lista o null para quitarlo", () => {
    expect(validarEdicion({ fondoPensiones: "Porvenir" }, FONDOS)).toEqual({ ok: true, valor: { fondo_pensiones: "Porvenir" } })
    expect(validarEdicion({ fondoPensiones: "" }, FONDOS)).toEqual({ ok: true, valor: { fondo_pensiones: null } })
  })

  it("rechaza fondos fuera de la lista, campos no editables y cuerpos vacíos", () => {
    expect(validarEdicion({ fondoPensiones: "Fondo X" }, FONDOS).ok).toBe(false)
    expect(validarEdicion({ nombre: "Otro", salario: 1 }, FONDOS)).toEqual({ ok: false, error: "No hay cambios" })
    expect(validarEdicion({ activo: "no" }, FONDOS).ok).toBe(false)
  })
})
