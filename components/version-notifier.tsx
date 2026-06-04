"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpCircle, Sparkles, X } from "lucide-react"

/**
 * VersionNotifier — Aviso de actualización a nivel de SITIO (esquina inferior derecha).
 *
 * Dos momentos:
 *  - "available": mientras la pestaña está abierta, sondea /api/version (versión
 *    desplegada) y, si difiere de la versión horneada en el bundle, ofrece recargar.
 *  - "updated": tras recargar con una versión nueva, confirma "Actualizado a vX.Y.Z"
 *    (se detecta comparando con la última versión vista en localStorage).
 */

const CURRENT = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"
const STORAGE_KEY = "nomina:appVersion"
const POLL_MS = 60_000
const FIRST_CHECK_MS = 5_000
const UPDATED_AUTO_DISMISS_MS = 9_000

type Mode = "none" | "updated" | "available"

export function VersionNotifier() {
  const [mode, setMode] = useState<Mode>("none")
  const [latest, setLatest] = useState(CURRENT)
  const dismissedRef = useRef(false)

  // Tras recargar: ¿la versión horneada cambió respecto a la última vista?
  useEffect(() => {
    let isUpdate = false
    try {
      const seen = localStorage.getItem(STORAGE_KEY)
      isUpdate = Boolean(seen && seen !== CURRENT)
      localStorage.setItem(STORAGE_KEY, CURRENT)
    } catch {
      // localStorage no disponible → omitir el aviso post-recarga
    }
    if (!isUpdate) return

    // Diferido: el toast entra cuando la página ya asentó (y evita setState síncrono).
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setLatest(CURRENT)
      setMode("updated")
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // El aviso informativo se autodescarta.
  useEffect(() => {
    if (mode !== "updated") return
    const timer = setTimeout(() => setMode("none"), UPDATED_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [mode])

  // Sondeo de la versión desplegada mientras la pestaña sigue abierta.
  useEffect(() => {
    let active = true

    const check = async () => {
      if (dismissedRef.current) return
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok || !active || dismissedRef.current) return
        const data = (await res.json()) as { version?: string }
        if (data.version && data.version !== CURRENT) {
          setLatest(data.version)
          setMode("available")
        }
      } catch {
        // Sin red o endpoint caído → reintentar en el siguiente ciclo
      }
    }

    const first = setTimeout(check, FIRST_CHECK_MS)
    const interval = setInterval(check, POLL_MS)
    const onFocus = () => check()
    window.addEventListener("focus", onFocus)

    return () => {
      active = false
      clearTimeout(first)
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  if (mode === "none") return null

  const isAvailable = mode === "available"
  const reload = () => window.location.reload()
  const dismiss = () => {
    // Al cerrar el aviso de nueva versión no se vuelve a mostrar en esta sesión.
    if (isAvailable) dismissedRef.current = true
    setMode("none")
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] w-[min(22rem,calc(100vw-2rem))]"
    >
      <div className="pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-lg shadow-black/5 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        {/* Barra de acento lateral */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${isAvailable ? "bg-primary" : "bg-emerald-500"}`}
        />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar aviso"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>

        <div className="flex gap-3 p-4 pl-5">
          <span
            aria-hidden
            className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
              isAvailable ? "bg-primary/10 text-primary" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {isAvailable ? <ArrowUpCircle className="size-5" /> : <Sparkles className="size-5" />}
          </span>

          <div className="min-w-0 flex-1 pr-5">
            <p className="text-sm font-semibold leading-tight">
              {isAvailable ? "Nueva versión disponible" : "Aplicación actualizada"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isAvailable ? (
                <>
                  Hay una actualización lista{" "}
                  <span className="font-mono font-medium text-foreground">v{latest}</span>. Recarga para
                  aplicar los últimos cambios.
                </>
              ) : (
                <>
                  Ahora usas la versión{" "}
                  <span className="font-mono font-medium text-foreground">v{latest}</span>.
                </>
              )}
            </p>

            {isAvailable ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={reload}
                  className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Actualizar ahora
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Después
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
