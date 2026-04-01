"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { SHIFT_CODES, SHIFT_DETAILS } from "@/src/constants/shifts"
import { ConcreteShiftCode } from "@/src/constants/shifts"
import { ShiftCode } from "@/src/types/schedule"

type TurnoConfig = {
  entrada: string
  salida: string
  total: string
  descripcion: string
}

type TurnosMap = Record<string, TurnoConfig>

type MedicosTurnosContextType = {
  turnos: TurnosMap
  turnosCodes: string[]
  setTurno: (code: string, patch: Partial<TurnoConfig>) => void
  addTurno: (code: string, config: TurnoConfig) => boolean
  removeTurno: (code: string) => boolean
  resetTurnos: () => void
  hoursByCode: Record<string, number>
  timeRangeByCode: Record<string, string>
  isDefaultTurno: (code: string) => boolean
}

const DEFAULT_CODES: string[] = ["M", "T", "N", "L", "A"]

const DEFAULT_TURNOS: TurnosMap = {
  M: { entrada: "06:00", salida: "13:00", total: "7", descripcion: SHIFT_DETAILS.M.description },
  T: { entrada: "13:00", salida: "20:00", total: "7", descripcion: SHIFT_DETAILS.T.description },
  N: { entrada: "20:00", salida: "06:00", total: "10", descripcion: SHIFT_DETAILS.N.description },
  L: { entrada: "", salida: "", total: "0", descripcion: SHIFT_DETAILS.L.description },
  A: { entrada: "", salida: "", total: "0", descripcion: SHIFT_DETAILS.A.description },
}

const MedicosTurnosContext = createContext<MedicosTurnosContextType | null>(null)

const parseHours = (value: string) => {
  const normalized = value.replace(",", ".").trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const isValidTurnoCode = (code: string): boolean => {
  return /^[A-Z]{1,3}$/.test(code)
}

export function MedicosTurnosProvider({ children }: { children: ReactNode }) {
  const [turnos, setTurnos] = useState<TurnosMap>(DEFAULT_TURNOS)
  const [turnosCodes, setTurnosCodes] = useState<string[]>(DEFAULT_CODES)

  const setTurno = (code: string, patch: Partial<TurnoConfig>) => {
    setTurnos((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        ...patch,
      },
    }))
  }

  const addTurno = (code: string, config: TurnoConfig): boolean => {
    if (!isValidTurnoCode(code) || turnosCodes.includes(code)) {
      return false
    }
    setTurnos((prev) => ({
      ...prev,
      [code]: config,
    }))
    setTurnosCodes((prev) => [...prev, code].sort())
    return true
  }

  const removeTurno = (code: string): boolean => {
    if (DEFAULT_CODES.includes(code)) {
      return false // No se pueden eliminar los turnos por defecto
    }
    setTurnos((prev) => {
      const newTurnos = { ...prev }
      delete newTurnos[code]
      return newTurnos
    })
    setTurnosCodes((prev) => prev.filter((c) => c !== code))
    return true
  }

  const resetTurnos = () => {
    setTurnos(DEFAULT_TURNOS)
    setTurnosCodes(DEFAULT_CODES)
  }

  const isDefaultTurno = (code: string): boolean => {
    return DEFAULT_CODES.includes(code)
  }

  const hoursByCode = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = { "": 0 }
    turnosCodes.forEach((code) => {
      result[code] = parseHours(turnos[code]?.total ?? "0")
    })
    return result
  }, [turnos, turnosCodes])

  const timeRangeByCode = useMemo<Record<string, string>>(() => {
    const result: Record<string, string> = { "": "Sin horario" }
    turnosCodes.forEach((code) => {
      const turno = turnos[code]
      if (!turno) return
      if (turno.entrada && turno.salida) {
        result[code] = `${turno.entrada} - ${turno.salida}`
      } else if (code === "L") {
        result[code] = "Libre"
      } else if (code === "A") {
        result[code] = "Ausente"
      } else {
        result[code] = "Sin horario"
      }
    })
    return result
  }, [turnos, turnosCodes])

  return (
    <MedicosTurnosContext.Provider
      value={{
        turnos,
        turnosCodes,
        setTurno,
        addTurno,
        removeTurno,
        resetTurnos,
        hoursByCode,
        timeRangeByCode,
        isDefaultTurno,
      }}
    >
      {children}
    </MedicosTurnosContext.Provider>
  )
}

export function useMedicosTurnos() {
  const context = useContext(MedicosTurnosContext)
  if (!context) {
    throw new Error("useMedicosTurnos debe usarse dentro de MedicosTurnosProvider")
  }
  return context
}

export const DEFAULT_TURNO_CODES = DEFAULT_CODES
