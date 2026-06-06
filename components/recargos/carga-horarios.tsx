"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, Upload } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

/**
 * Sección colapsable "Carga de horarios". Envuelve el FileUpload y los mensajes/acciones
 * de BD para que el área de carga pueda mostrarse/ocultarse y no ocupe espacio siempre.
 */
export function CargaHorarios({
  children,
  defaultOpen = true,
}: {
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-2xl border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Carga de horarios</p>
            <p className="text-sm text-foreground/70">
              {open ? "Sube o actualiza el archivo de turnos" : "Mostrar para cargar un archivo"}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-4">
        <div className="flex flex-col gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
