"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Clock, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

type TurnoRow = {
  dig: string
  entrada: string
  salida: string
  total: string
  descripcion: string
}

const DEFAULT_TURNOS: TurnoRow[] = [
  { dig: "M", entrada: "6:00", salida: "13:00", total: "7:00", descripcion: "M (mañana)" },
  { dig: "T", entrada: "13:00", salida: "20:00", total: "7:00", descripcion: "T (tarde)" },
  { dig: "N", entrada: "20:00", salida: "6:00", total: "10:00", descripcion: "N (noche)" },
  { dig: "D", entrada: "7:00", salida: "19:00", total: "12:00", descripcion: "D (dia)" },
  { dig: "NS", entrada: "19:00", salida: "7:00", total: "12:00", descripcion: "Nsabado (NS)" },
  { dig: "NV", entrada: "20:00", salida: "7:00", total: "11:00", descripcion: "Nviernes (NV)" },
  { dig: "ND", entrada: "19:00", salida: "6:00", total: "11:00", descripcion: "Ndomingo (ND)" },
  { dig: "MT", entrada: "6:00", salida: "20:00", total: "14:00", descripcion: "Mañana Tarde" },
]

export function MedicosSettings() {
  const [turnos, setTurnos] = useState<TurnoRow[]>(DEFAULT_TURNOS)

  const updateTurno = (index: number, field: keyof TurnoRow, value: string) => {
    setTurnos((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const resetTurnos = () => setTurnos(DEFAULT_TURNOS)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Clock className="size-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Turnos Médicos</h3>
            <p className="text-[11px] text-muted-foreground">Configuración de jornadas</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={resetTurnos}
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Restaurar valores por defecto"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <Separator />

      {/* Column headers */}
      <div className="grid grid-cols-[44px_1fr_1fr_52px] items-center gap-1.5 px-0.5">
        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          DIG
        </Label>
        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Entrada
        </Label>
        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Salida
        </Label>
        <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 text-right">
          Total
        </Label>
      </div>

      {/* Turno rows */}
      <div className="flex flex-col gap-2">
        {turnos.map((turno, i) => (
          <div
            key={turno.dig + i}
            className="group relative grid grid-cols-[44px_1fr_1fr_52px] items-center gap-1.5 rounded-lg border border-transparent px-0.5 py-1 transition-colors hover:border-border hover:bg-muted/40"
          >
            {/* DIG badge */}
            <div className="flex items-center justify-center">
              <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md bg-primary/8 px-1.5 text-xs font-bold tracking-wide text-primary">
                {turno.dig}
              </span>
            </div>

            {/* Entrada */}
            <Input
              value={turno.entrada}
              onChange={(e) => updateTurno(i, "entrada", e.target.value)}
              className="h-7 border-transparent bg-transparent px-2 text-xs font-medium tabular-nums shadow-none transition-colors focus-visible:border-input focus-visible:bg-background group-hover:border-input/50"
            />

            {/* Salida */}
            <Input
              value={turno.salida}
              onChange={(e) => updateTurno(i, "salida", e.target.value)}
              className="h-7 border-transparent bg-transparent px-2 text-xs font-medium tabular-nums shadow-none transition-colors focus-visible:border-input focus-visible:bg-background group-hover:border-input/50"
            />

            {/* Total (read-only visual) */}
            <span className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
              {turno.total}
            </span>

            {/* Description tooltip on hover */}
            <div className="col-span-4 overflow-hidden transition-all duration-200 max-h-0 group-hover:max-h-8">
              <p className="px-1 pb-0.5 text-[10px] text-muted-foreground/60 italic">
                {turno.descripcion}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {/* Footer info */}
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Modifica los horarios de entrada y salida de cada turno. Los cambios se aplicarán a la tabla de horas extras de médicos.
      </p>
    </div>
  )
}
