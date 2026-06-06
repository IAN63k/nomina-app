"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { ScheduleTable } from "@/src/components/ScheduleTable"
import type { MonthSchedule } from "@/src/types/schedule"

type ShiftDetail = { label: string; bg: string; text: string; border: string; description?: string }
type ShiftColors = { bg: string; text: string; border: string }

type MallaDrawerProps = {
  month?: MonthSchedule
  onShiftChange?: (doctorName: string, dayNumber: number, code: string) => void
  timeRangeByCode?: Partial<Record<string, string>>
  availableTurnos?: string[]
  nameLabel?: string
  shiftDetails?: Record<string, ShiftDetail>
  shiftColors?: Record<string, ShiftColors>
  colorOf?: (code: string) => ShiftColors
}

/**
 * Malla de turnos como panel lateral fijo (drawer). Una pestaña vertical en el borde
 * derecho la abre/cierra; al abrirse se superpone al detalle, permanece fija al hacer
 * scroll en la página y tiene su propio scroll interno.
 */
export function MallaDrawer(props: MallaDrawerProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)

  // Cerrar con Escape o al hacer clic fuera del panel (y de la pestaña).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || tabRef.current?.contains(target)) return
      // Ignorar clics dentro de portales de Radix (dropdown de turnos, tooltips),
      // que se renderizan fuera del panel pero son parte de la malla.
      if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]")) return
      setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  return (
    <>
      {/* Pestaña en el borde derecho: abre/oculta la malla */}
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="malla-drawer-panel"
        className="fixed right-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1 rounded-l-lg border border-r-0 border-border bg-primary py-4 pl-1.5 pr-1 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        {open ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
        <span className="text-xs font-semibold [writing-mode:vertical-rl]">Malla de turnos</span>
      </button>

      {/* Panel deslizable fijo */}
      <div
        ref={panelRef}
        id="malla-drawer-panel"
        role="dialog"
        aria-label="Malla de turnos"
        aria-hidden={!open}
        className={`fixed bottom-6 top-20 z-40 flex w-[min(92vw,1100px)] flex-col overflow-hidden rounded-l-2xl border border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[105%]"
        }`}
        style={{ right: "2.25rem" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Malla de turnos</p>
            <p className="text-sm text-foreground/70">Visualiza y edita los turnos del mes</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Ocultar malla"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <ScheduleTable {...props} />
        </div>
      </div>
    </>
  )
}
