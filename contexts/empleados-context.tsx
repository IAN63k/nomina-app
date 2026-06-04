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

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react"

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

  // Índice de búsqueda: dos llaves por empleado para tolerar diferencias de orden
  // de palabras ("Apellidos Nombres" vs "Nombres Apellidos") y de espacios internos.
  const cedulaIndex = useMemo(() => {
    const byFull = new Map<string, string>()
    const byTokens = new Map<string, string>()
    for (const e of empleados) {
      const full = normalize(e.nombre)
      if (!full) continue
      if (!byFull.has(full)) byFull.set(full, e.cedula)
      const tokens = tokenKey(full)
      if (!byTokens.has(tokens)) byTokens.set(tokens, e.cedula)
    }
    return { byFull, byTokens }
  }, [empleados])

  const getCedulaByName = useCallback(
    (nombre: string): string => {
      if (!empleados.length) return "0000000000"
      const q = normalize(nombre)
      // 1) Coincidencia exacta del nombre completo.
      const exact = cedulaIndex.byFull.get(q)
      if (exact) return exact
      // 2) Mismas palabras en distinto orden.
      const byTokens = cedulaIndex.byTokens.get(tokenKey(q))
      if (byTokens) return byTokens
      return "0000000000"
    },
    [empleados, cedulaIndex]
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
    .replace(/\s+/g, " ") // colapsar espacios internos m\u00faltiples
}

// Llave independiente del orden de las palabras: tokens ordenados alfab\u00e9ticamente.
// Recibe un nombre YA normalizado. Permite cruzar "garcia lopez juan" con
// "juan garcia lopez".
function tokenKey(normalized: string) {
  return normalized.split(" ").filter(Boolean).sort().join(" ")
}
