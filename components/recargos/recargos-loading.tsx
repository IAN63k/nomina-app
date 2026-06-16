"use client"

import { Loader2 } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Estado de carga del módulo de Recargos. Se muestra en el área principal mientras
 * se consultan los datos guardados en BD, de forma visible e independiente del
 * colapsable "Carga de horarios", para que el usuario sepa que la app está trabajando
 * y no repita acciones (recargar, volver a hacer clic, etc.).
 */
export function RecargosLoading({
  label = "Cargando información...",
  description = "Estamos consultando los turnos guardados en la base de datos.",
}: {
  label?: string
  description?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-2xl border-2 border-primary/20 bg-card p-8 shadow-md"
    >
      <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
        {/* Spinner con halo */}
        <div className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
          <span className="absolute inset-0 rounded-full border border-primary/20" />
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>

        <div className="space-y-1">
          <p className="text-base font-semibold tracking-tight text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Esqueleto que insinúa la tabla de detalle que está por llegar */}
      <div className="mt-2 space-y-3" aria-hidden="true">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="ml-auto h-9 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-4/5" />
      </div>

      <span className="sr-only">Cargando información de recargos, por favor espera.</span>
    </div>
  )
}
