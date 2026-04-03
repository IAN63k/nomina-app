"use client"

/**
 * EmpleadosContext
 *
 * Almacena la lista de empleados ÚNICAMENTE en memoria React + sessionStorage.
 * - sessionStorage se borra automáticamente al cerrar la pestaña/navegador.
 * - Nunca se persiste en base de datos ni en localStorage.
 * - Si un atacante compromete el servidor no encuentra estos datos: nunca viajan
 *   a ningún backend ni se almacenan fuera del navegador del usuario.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"

export type Empleado = {
  nombre: string
  cedula: string
  cargo?: string
}

type EmpleadosContextType = {
  empleados: Empleado[]
  loadEmpleados: (data: Empleado[]) => void
  clearEmpleados: () => void
  /** Devuelve la cédula del empleado que más se parezca al nombre, o "0000000000" si no encuentra. */
  getCedulaByName: (nombre: string) => string
}

const SESSION_KEY = "emp_sess"

const EmpleadosContext = createContext<EmpleadosContextType | null>(null)

export function EmpleadosProvider({ children }: { children: ReactNode }) {
  const [empleados, setEmpleados] = useState<Empleado[]>([])

  // Restaurar desde sessionStorage al montar (misma pestaña tras navegación interna)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) setEmpleados(JSON.parse(raw) as Empleado[])
    } catch {
      // sessionStorage no disponible o dato corrupto → ignorar
    }
  }, [])

  const loadEmpleados = useCallback((data: Empleado[]) => {
    setEmpleados(data)
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
    } catch {}
  }, [])

  const clearEmpleados = useCallback(() => {
    setEmpleados([])
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {}
  }, [])

  const getCedulaByName = useCallback(
    (nombre: string): string => {
      if (!empleados.length) return "0000000000"
      const q = normalize(nombre)
      const found = empleados.find((e) => normalize(e.nombre) === q)
      return found?.cedula ?? "0000000000"
    },
    [empleados]
  )

  return (
    <EmpleadosContext.Provider value={{ empleados, loadEmpleados, clearEmpleados, getCedulaByName }}>
      {children}
    </EmpleadosContext.Provider>
  )
}

export function useEmpleados() {
  const ctx = useContext(EmpleadosContext)
  if (!ctx) throw new Error("useEmpleados debe usarse dentro de EmpleadosProvider")
  return ctx
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalize(str: string) {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
}
