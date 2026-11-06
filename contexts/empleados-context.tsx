"use client"

/**
 * EmpleadosContext — maestro de colaboradores compartido.
 *
 * Los colaboradores viven en la tabla `colaboradores` de Supabase (aprobado por
 * el responsable de datos el 2026-11-05; sin salarios ni datos de salud) y se
 * leen/escriben SOLO por app/api/colaboradores/*, con sesión firmada y rol.
 * Antes vivían en sessionStorage; esa copia se borra al montar.
 *
 * Recargos y la exportación TXT siguen usando getCedulaByName igual que antes.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react"
import { useAuth } from "@/contexts/auth-context"
import { parseEmpleadosFile, type ResultadoEmpleados } from "@/src/services/empleadosParser"
import type { Colaborador } from "@/src/types/colaborador"
import { crearIndiceCedulas } from "@/src/services/cedulaPorNombre"

/** Alias histórico: el resto de la app importa `Empleado`. */
export type Empleado = Colaborador

export type EstadoEmpleados = "cargando" | "listo" | "sin_sesion" | "error"

export interface ResumenImportacion {
  total: number
  nuevos: number
  actualizados: number
  sin_cambios: number
  /** Textos de fondo del archivo que no coinciden con la lista (se ignoraron). */
  fondos_no_reconocidos: string[]
  lectura: Pick<ResultadoEmpleados, "columnas" | "omitidas" | "duplicadas">
}

type EmpleadosContextType = {
  empleados: Empleado[]
  fondos: string[]
  estado: EstadoEmpleados
  error: string | null
  recargar: () => Promise<void>
  importarArchivo: (file: File) => Promise<ResumenImportacion>
  actualizar: (cedula: string, cambios: Partial<Pick<Colaborador, "cargo" | "sede" | "fondoPensiones" | "activo">>) => Promise<void>
  /** Cédula del colaborador con ese nombre (completo, otro orden o abreviado sin ambigüedad), o "0000000000". */
  getCedulaByName: (nombre: string) => string
}

const SESSION_KEY_ANTIGUA = "emp_sess"

const EmpleadosContext = createContext<EmpleadosContextType | null>(null)

async function leerError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Error ${res.status}`
  } catch {
    return `Error ${res.status}`
  }
}

export function EmpleadosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [fondos, setFondos] = useState<string[]>([])
  const [estado, setEstado] = useState<EstadoEmpleados>("cargando")
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/colaboradores", { cache: "no-store" })
      if (res.status === 401) {
        setEmpleados([])
        setEstado("sin_sesion")
        return
      }
      if (!res.ok) throw new Error(await leerError(res))
      const data = (await res.json()) as { colaboradores: Empleado[]; fondos: string[] }
      setEmpleados(data.colaboradores)
      setFondos(data.fondos)
      setEstado("listo")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el listado.")
      setEstado("error")
    }
  }, [])

  useEffect(() => {
    // La lista ya no vive en el navegador: borrar la copia que dejó la versión anterior.
    try {
      sessionStorage.removeItem(SESSION_KEY_ANTIGUA)
    } catch {}
  }, [])

  useEffect(() => {
    if (!user) {
      setEmpleados([])
      setEstado("sin_sesion")
      return
    }
    setEstado("cargando")
    void recargar()
  }, [user, recargar])

  const importarArchivo = useCallback(
    async (file: File): Promise<ResumenImportacion> => {
      const lectura = await parseEmpleadosFile(file)
      const res = await fetch("/api/colaboradores/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo: file.name, colaboradores: lectura.colaboradores }),
      })
      if (res.status === 401) {
        setEstado("sin_sesion")
        throw new Error("Tu sesión venció. Vuelve a iniciar sesión para guardar el listado.")
      }
      if (!res.ok) throw new Error(await leerError(res))
      const resumen = (await res.json()) as Omit<ResumenImportacion, "lectura">
      await recargar()
      return { ...resumen, lectura: { columnas: lectura.columnas, omitidas: lectura.omitidas, duplicadas: lectura.duplicadas } }
    },
    [recargar],
  )

  const actualizar = useCallback<EmpleadosContextType["actualizar"]>(async (cedula, cambios) => {
    const res = await fetch(`/api/colaboradores/${encodeURIComponent(cedula)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    })
    if (res.status === 401) {
      setEstado("sin_sesion")
      throw new Error("Tu sesión venció. Vuelve a iniciar sesión.")
    }
    if (!res.ok) throw new Error(await leerError(res))
    const actualizado = (await res.json()) as Empleado
    setEmpleados((prev) => prev.map((e) => (e.cedula === cedula ? actualizado : e)))
  }, [])

  // Cruce nombre → cédula (completo, otro orden o abreviado único): src/services/cedulaPorNombre.ts
  const indiceCedulas = useMemo(() => crearIndiceCedulas(empleados), [empleados])
  const getCedulaByName = useCallback((nombre: string): string => indiceCedulas.buscar(nombre), [indiceCedulas])

  return (
    <EmpleadosContext.Provider
      value={{ empleados, fondos, estado, error, recargar, importarArchivo, actualizar, getCedulaByName }}
    >
      {children}
    </EmpleadosContext.Provider>
  )
}

export function useEmpleados() {
  const ctx = useContext(EmpleadosContext)
  if (!ctx) throw new Error("useEmpleados debe usarse dentro de EmpleadosProvider")
  return ctx
}
