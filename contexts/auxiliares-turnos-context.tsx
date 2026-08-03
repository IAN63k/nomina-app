"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import {
  AUX_DEFAULT_CODES,
  AUX_DEFAULT_TURNOS,
  type AuxTurnoConfig,
} from "@/src/constants/auxiliaresShifts"

type TurnosMap = Record<string, AuxTurnoConfig>

type AuxiliaresTurnosContextType = {
  turnos: TurnosMap
  turnosCodes: string[]
  setTurno: (code: string, patch: Partial<AuxTurnoConfig>) => void
  addTurno: (code: string, config: AuxTurnoConfig) => boolean
  removeTurno: (code: string) => boolean
  resetTurnos: () => void
  hoursByCode: Record<string, number>
  timeRangeByCode: Record<string, string>
  isDefaultTurno: (code: string) => boolean
}

const AuxiliaresTurnosContext = createContext<AuxiliaresTurnosContextType | null>(null)

const parseHours = (value: string) => {
  const normalized = value.replace(",", ".").trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const isValidTurnoCode = (code: string): boolean => {
  return /^[A-Z0-9]{1,5}$/.test(code)
}

/** Horas de reloj entre entrada y salida (`HH:MM`), asumiendo cruce de medianoche si salida <= entrada. */
const computeClockHours = (entrada: string, salida: string): number => {
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const start = toMinutes(entrada)
  const end = toMinutes(salida)
  if (start === null || end === null) return 0
  const diffMinutes = end > start ? end - start : 1440 - start + end
  return Math.round((diffMinutes / 60) * 100) / 100
}

export function AuxiliaresTurnosProvider({ children }: { children: ReactNode }) {
  const [turnos, setTurnos] = useState<TurnosMap>(AUX_DEFAULT_TURNOS)
  const [turnosCodes, setTurnosCodes] = useState<string[]>(AUX_DEFAULT_CODES)

  const setTurno = (code: string, patch: Partial<AuxTurnoConfig>) => {
    setTurnos((prev) => {
      const next = { ...prev[code], ...patch }
      // Autocompleta "Total" cuando terminan de configurarse entrada y salida de un
      // turno cuyo total sigue en el "0" por defecto (típicamente uno recién creado
      // desde "Agregar un turno personalizado"): sin esto, el turno queda con 0 horas
      // oficiales y no cuenta para el tope semanal ni genera recargo/extra al usarlo.
      if (
        (patch.entrada !== undefined || patch.salida !== undefined) &&
        next.entrada &&
        next.salida &&
        parseHours(next.total ?? "0") === 0
      ) {
        const computed = computeClockHours(next.entrada, next.salida)
        if (computed > 0) next.total = String(computed)
      }
      return { ...prev, [code]: next }
    })
  }

  const addTurno = (code: string, config: AuxTurnoConfig): boolean => {
    if (!isValidTurnoCode(code) || turnosCodes.includes(code)) {
      return false
    }
    setTurnos((prev) => ({
      ...prev,
      [code]: config,
    }))
    setTurnosCodes((prev) => [...prev, code])
    return true
  }

  const removeTurno = (code: string): boolean => {
    if (AUX_DEFAULT_CODES.includes(code)) {
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
    setTurnos(AUX_DEFAULT_TURNOS)
    setTurnosCodes(AUX_DEFAULT_CODES)
  }

  const isDefaultTurno = (code: string): boolean => {
    return AUX_DEFAULT_CODES.includes(code)
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
      } else {
        result[code] = "Sin horario"
      }
    })
    return result
  }, [turnos, turnosCodes])

  return (
    <AuxiliaresTurnosContext.Provider
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
    </AuxiliaresTurnosContext.Provider>
  )
}

export function useAuxiliaresTurnos() {
  const context = useContext(AuxiliaresTurnosContext)
  if (!context) {
    throw new Error("useAuxiliaresTurnos debe usarse dentro de AuxiliaresTurnosProvider")
  }
  return context
}
