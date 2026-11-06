"use client"

/**
 * Datos del módulo de Incapacidades para todas las pestañas.
 *
 * Se piden una vez a GET /api/incapacidades y se calculan aquí con
 * incapacidadesEngine.ts (la misma fuente de verdad del servidor): tabla,
 * Resumen, vistas y exportación leen de `items`, así siempre cuadran.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useAuth } from "@/contexts/auth-context"
import { puede, type Accion } from "@/src/lib/permisos"
import { calcularCobro, type IncapacidadCalculada } from "@/src/services/incapacidadesEngine"
import type { Incapacidad, Pago, ParametrosIncapacidades } from "@/src/types/incapacidad"
import { mensajeDe, onSesionVencida, pedir } from "./api"

export interface PqrdVista {
  id: string
  incapacidadId: string
  radicado: string
  entidad: string
  fechaRadicacion: string
  motivo: string
  fechaLimite: string
  estado: "Abierta" | "Respondida a favor" | "Respondida en contra"
  fechaRespuesta: string | null
  resumenRespuesta: string | null
  tieneSoporte: boolean
}

interface Datos {
  params: ParametrosIncapacidades
  corte: string
  incapacidades: Incapacidad[]
  pagos: Pago[]
  pqrd: PqrdVista[]
  fondos: Record<string, string>
  ultimaGestion: Record<string, string>
}

export type ItemSeguimiento = IncapacidadCalculada & {
  fondo: string | null
  pqrdAbierta: PqrdVista | null
  ultimaGestion: string | null
}

type Estado = "cargando" | "listo" | "sin_sesion" | "error"

interface ContextoIncapacidades {
  estado: Estado
  error: string | null
  datos: Datos | null
  items: ItemSeguimiento[]
  recargar: () => Promise<void>
  puede: (accion: Accion) => boolean
  sesionVencida: () => void
}

const Ctx = createContext<ContextoIncapacidades | null>(null)

export function IncapacidadesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [estado, setEstado] = useState<Estado>("cargando")
  const [error, setError] = useState<string | null>(null)

  const sesionVencida = useCallback(() => setEstado("sin_sesion"), [])

  const recargar = useCallback(async () => {
    try {
      const d = await pedir<Datos>("/api/incapacidades")
      setDatos(d)
      setError(null)
      setEstado("listo")
    } catch (e) {
      if ((e as { status?: number }).status === 401) return // ya lo marcó onSesionVencida
      setError(mensajeDe(e))
      setEstado("error")
    }
  }, [])

  useEffect(() => {
    onSesionVencida(sesionVencida)
    return () => onSesionVencida(null)
  }, [sesionVencida])

  useEffect(() => {
    let vigente = true
    ;(async () => {
      if (!user) {
        if (vigente) setEstado("sin_sesion")
        return
      }
      await recargar()
    })()
    return () => {
      vigente = false
    }
  }, [user, recargar])

  const items = useMemo<ItemSeguimiento[]>(() => {
    if (!datos) return []
    const pagosPor = new Map<string, Pago[]>()
    for (const p of datos.pagos) pagosPor.set(p.incapacidadId, [...(pagosPor.get(p.incapacidadId) ?? []), p])
    const pqrdAbierta = new Map<string, PqrdVista>()
    for (const p of datos.pqrd) if (p.estado === "Abierta") pqrdAbierta.set(p.incapacidadId, p)

    return datos.incapacidades.map((inc) => {
      const fondo = datos.fondos[inc.identificacion] ?? null
      const abierta = pqrdAbierta.get(inc.id!) ?? null
      return {
        inc,
        fondo,
        pqrdAbierta: abierta,
        ultimaGestion: datos.ultimaGestion[inc.id!] ?? null,
        cobro: calcularCobro(inc, pagosPor.get(inc.id!) ?? [], {
          params: datos.params, corte: datos.corte, fondo, tienePqrdAbierta: Boolean(abierta),
        }),
      }
    })
  }, [datos])

  const valor = useMemo<ContextoIncapacidades>(
    () => ({ estado, error, datos, items, recargar, puede: (a) => puede(user?.rol, a), sesionVencida }),
    [estado, error, datos, items, recargar, user?.rol, sesionVencida],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useIncapacidades() {
  const c = useContext(Ctx)
  if (!c) throw new Error("useIncapacidades debe usarse dentro de IncapacidadesProvider")
  return c
}
