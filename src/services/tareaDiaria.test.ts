import { describe, it, expect } from "vitest"
import { estadoTareaDiaria } from "./tareaDiaria"

const AHORA = new Date("2026-11-05T15:00:00Z") // 10:00 a. m. Bogotá
const ej = (created_at: string, ok = true) => ({ created_at, ok })

describe("estado de la tarea diaria", () => {
  it("nunca ha corrido", () => {
    expect(estadoTareaDiaria([], AHORA)).toEqual({ estado: "nunca" })
  })

  it("al día si corrió hoy o hasta hace 2 días (margen del plan gratuito)", () => {
    expect(estadoTareaDiaria([ej("2026-11-05T11:20:00Z")], AHORA).estado).toBe("al_dia")
    expect(estadoTareaDiaria([ej("2026-11-03T11:59:00Z")], AHORA).estado).toBe("al_dia")
  })

  it("atrasada si pasaron más de 2 días", () => {
    expect(estadoTareaDiaria([ej("2026-11-02T11:00:00Z")], AHORA)).toMatchObject({ estado: "atrasada", dias: 3 })
  })

  it("falló si la última ejecución falló, y recuerda la última exitosa", () => {
    const r = estadoTareaDiaria([ej("2026-11-05T11:00:00Z", false), ej("2026-11-04T11:00:00Z")], AHORA)
    expect(r).toMatchObject({ estado: "fallo", ultimaExitosa: { created_at: "2026-11-04T11:00:00Z" } })
  })
})
