"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import type { EstadoTarea } from "@/src/services/tareaDiaria"

/** Evento para que el contador se refresque al atender o evaluar alertas. */
export const EVENTO_ALERTAS = "incapacidades:alertas-cambiaron"
export const avisarCambioAlertas = () => window.dispatchEvent(new Event(EVENTO_ALERTAS))

export interface ResumenAlertas {
  pendientes: number
  tarea: EstadoTarea
}

const CADA_MS = 10 * 60 * 1000

/**
 * Pendientes y estado de la tarea diaria. Devuelve null si el usuario no tiene
 * sesión firmada o permiso (el contador simplemente no se muestra).
 */
export function useResumenAlertas(activo = true): ResumenAlertas | null {
  const pathname = usePathname()
  const [resumen, setResumen] = useState<ResumenAlertas | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/incapacidades/alertas/resumen", { cache: "no-store" })
      setResumen(res.ok ? ((await res.json()) as ResumenAlertas) : null)
    } catch {
      setResumen(null)
    }
  }, [])

  useEffect(() => {
    if (!activo) return
    void (async () => { await cargar() })()
  }, [activo, cargar, pathname])

  useEffect(() => {
    if (!activo) return
    const refrescar = () => void cargar()
    window.addEventListener(EVENTO_ALERTAS, refrescar)
    const intervalo = window.setInterval(refrescar, CADA_MS)
    return () => {
      window.removeEventListener(EVENTO_ALERTAS, refrescar)
      window.clearInterval(intervalo)
    }
  }, [activo, cargar])

  return resumen
}
