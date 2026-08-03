"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { SHIFT_CODES, SHIFT_DETAILS } from "@/src/constants/shifts"
import { ConcreteShiftCode } from "@/src/constants/shifts"
import { ShiftCode } from "@/src/types/schedule"
import {
  deleteAllTurnosCatalogo,
  deleteTurnoCatalogo,
  fetchTurnosCatalogo,
  upsertTurnoCatalogo,
} from "@/src/services/turnosCatalogoDb"

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
  /**
   * true una vez que el catálogo de turnos personalizados terminó de hidratarse desde
   * BD (con éxito o no). Los consumidores que reconstruyen `months` a partir de filas
   * guardadas (medicos-tab/auxiliares-tab) deben esperar a esto antes de leer
   * `hoursByCode`: si reconstruyen antes, un turno personalizado (p. ej. "ET") aún no
   * hidratado calcula 0 horas y ese valor queda fijo en la celda hasta el próximo
   * reload (no se recalcula solo al llegar el catálogo).
   */
  catalogLoaded: boolean
}

const DEFAULT_CODES: string[] = ["M", "T", "N", "L", "A"]

const DEFAULT_TURNOS: TurnosMap = {
  M: { entrada: "06:00", salida: "13:00", total: "7", descripcion: SHIFT_DETAILS.M.description },
  T: { entrada: "13:00", salida: "20:00", total: "7", descripcion: SHIFT_DETAILS.T.description },
  // 10h de reloj menos 1h de refrigerio (00:00–01:00): la jornada oficial es de 9h.
  // El refrigerio no se trabaja, así que ni se paga ni consume jornada ordinaria.
  N: { entrada: "20:00", salida: "06:00", total: "9", descripcion: SHIFT_DETAILS.N.description },
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

export function MedicosTurnosProvider({ children }: { children: ReactNode }) {
  const [turnos, setTurnos] = useState<TurnosMap>(DEFAULT_TURNOS)
  const [turnosCodes, setTurnosCodes] = useState<string[]>(DEFAULT_CODES)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const catalogTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Hidratar turnos personalizados guardados en BD (compartidos entre usuarios/sesiones).
  useEffect(() => {
    let cancelled = false
    fetchTurnosCatalogo("medicos")
      .then((fetched) => {
        if (cancelled) return
        const customEntries = Object.entries(fetched).filter(([code]) => !DEFAULT_CODES.includes(code))
        if (!customEntries.length) return
        setTurnos((prev) => {
          const next = { ...prev }
          customEntries.forEach(([code, config]) => { next[code] = config })
          return next
        })
        setTurnosCodes((prev) => {
          const codes = new Set(prev)
          customEntries.forEach(([code]) => codes.add(code))
          return Array.from(codes).sort()
        })
      })
      .catch(() => {
        // Sin catálogo persistido o Supabase no disponible: se mantienen los turnos por defecto.
      })
      .finally(() => {
        if (!cancelled) setCatalogLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persistTurno = (code: string, config: TurnoConfig) => {
    if (DEFAULT_CODES.includes(code)) return
    if (catalogTimers.current[code]) clearTimeout(catalogTimers.current[code])
    catalogTimers.current[code] = setTimeout(() => {
      upsertTurnoCatalogo("medicos", code, config).catch(() => {
        // Persistencia best-effort: el turno sigue funcionando en memoria si Supabase falla.
      })
    }, 500)
  }

  const setTurno = (code: string, patch: Partial<TurnoConfig>) => {
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
      persistTurno(code, next)
      return { ...prev, [code]: next }
    })
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
    upsertTurnoCatalogo("medicos", code, config).catch(() => {
      // Persistencia best-effort: el turno sigue funcionando en memoria si Supabase falla.
    })
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
    if (catalogTimers.current[code]) {
      clearTimeout(catalogTimers.current[code])
      delete catalogTimers.current[code]
    }
    deleteTurnoCatalogo("medicos", code).catch(() => {
      // Persistencia best-effort: la eliminación local ya aplicó.
    })
    return true
  }

  const resetTurnos = () => {
    setTurnos(DEFAULT_TURNOS)
    setTurnosCodes(DEFAULT_CODES)
    Object.values(catalogTimers.current).forEach(clearTimeout)
    catalogTimers.current = {}
    deleteAllTurnosCatalogo("medicos").catch(() => {
      // Persistencia best-effort: el reset local ya aplicó.
    })
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
        catalogLoaded,
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
