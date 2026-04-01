"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Clock, Plus, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMedicosTurnos } from "@/contexts/medicos-turnos-context"
import { useSettingsSidebar } from "@/contexts/settings-sidebar-context"

export function MedicosSettings() {
  const { turnos, turnosCodes, setTurno, addTurno, removeTurno, resetTurnos, isDefaultTurno } = useMedicosTurnos()
  const { recargoConfig, setRecargoConfig, resetRecargoConfig } = useSettingsSidebar()
  const [newTurnoCode, setNewTurnoCode] = useState("")
  const [addError, setAddError] = useState("")

  const handleAddTurno = () => {
    setAddError("")
    const code = newTurnoCode.toUpperCase().trim()

    if (!code) {
      setAddError("Ingresa un código de turno")
      return
    }

    if (!/^[A-Z]{1,3}$/.test(code)) {
      setAddError("Máximo 3 letras mayúsculas (ej: MT, ED, FDS)")
      return
    }

    if (turnosCodes.includes(code)) {
      setAddError(`El turno "${code}" ya existe`)
      return
    }

    const success = addTurno(code, {
      entrada: "",
      salida: "",
      total: "0",
      descripcion: `Turno personalizado ${code}`,
    })

    if (success) {
      setNewTurnoCode("")
    }
  }

  const handleRemoveTurno = (code: string) => {
    removeTurno(code)
  }

  const sortedCodes = useMemo(() => {
    const defaults = turnosCodes.filter((c) => isDefaultTurno(c))
    const custom = turnosCodes.filter((c) => !isDefaultTurno(c)).sort()
    return [...defaults, ...custom]
  }, [turnosCodes, isDefaultTurno])

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

      {/* Recargos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight">Recargos nocturnos</p>
            <p className="text-[11px] text-muted-foreground">Configura horario y descuento aplicado a turnos que cruzan de día.</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={resetRecargoConfig}
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Restaurar recargos por defecto"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Inicio nocturno</Label>
            <Input
              value={recargoConfig.nightStart}
              onChange={(e) => setRecargoConfig({ nightStart: e.target.value })}
              placeholder="19:00"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Fin nocturno</Label>
            <Input
              value={recargoConfig.nightEnd}
              onChange={(e) => setRecargoConfig({ nightEnd: e.target.value })}
              placeholder="06:00"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Descuento por cruce</Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              value={recargoConfig.nightDiffHours}
              onChange={(e) => setRecargoConfig({ nightDiffHours: Number(e.target.value) })}
              placeholder="1"
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">Horas a descontar cuando el turno cruza medianoche.</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Column headers */}
      <div className="grid grid-cols-[44px_1fr_1fr_56px_24px] items-center gap-1.5 px-0.5">
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
        <div className="w-6" />
      </div>

      {/* Turno rows */}
      <div className="flex flex-col gap-2">
        {sortedCodes.map((code) => {
          const turno = turnos[code]
          const isDefault = isDefaultTurno(code)
          return (
            <div
              key={code}
              className="group relative grid grid-cols-[44px_1fr_1fr_56px_24px] items-center gap-1.5 rounded-lg border border-transparent px-0.5 py-1 transition-colors hover:border-border hover:bg-muted/40"
            >
              {/* DIG badge */}
              <div className="flex items-center justify-center">
                <span className={`inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-bold tracking-wide ${
                  isDefault ? "bg-primary/8 text-primary" : "bg-amber-500/10 text-amber-600"
                }`}>
                  {code}
                </span>
              </div>

              {/* Entrada */}
              <Input
                value={turno.entrada}
                onChange={(e) => setTurno(code, { entrada: e.target.value })}
                placeholder="HH:MM"
                className="h-7 border-transparent bg-transparent px-2 text-xs font-medium tabular-nums shadow-none transition-colors focus-visible:border-input focus-visible:bg-background group-hover:border-input/50"
              />

              {/* Salida */}
              <Input
                value={turno.salida}
                onChange={(e) => setTurno(code, { salida: e.target.value })}
                placeholder="HH:MM"
                className="h-7 border-transparent bg-transparent px-2 text-xs font-medium tabular-nums shadow-none transition-colors focus-visible:border-input focus-visible:bg-background group-hover:border-input/50"
              />

              {/* Total editable */}
              <Input
                value={turno.total}
                onChange={(e) => setTurno(code, { total: e.target.value })}
                placeholder="0"
                className="h-7 border-transparent bg-transparent px-2 text-right text-xs font-semibold tabular-nums shadow-none transition-colors focus-visible:border-input focus-visible:bg-background group-hover:border-input/50"
              />

              {/* Delete button for custom turnos */}
              {!isDefault && (
                <button
                  type="button"
                  onClick={() => handleRemoveTurno(code)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Eliminar turno ${code}`}
                >
                  <X className="size-4" />
                </button>
              )}

              {/* Description tooltip on hover */}
              <div className="col-span-5 overflow-hidden transition-all duration-200 max-h-0 group-hover:max-h-8">
                <p className="px-1 pb-0.5 text-[10px] text-muted-foreground/60 italic">
                  {turno.descripcion}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Separator />

      {/* Add new turno form */}
      <div className="space-y-2">
        <Label htmlFor="new-turno" className="text-xs font-semibold">
          Agregar un turno personalizado
        </Label>
        <div className="flex gap-2">
          <Input
            id="new-turno"
            value={newTurnoCode}
            onChange={(e) => {
              setNewTurnoCode(e.target.value)
              setAddError("")
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTurno()
            }}
            placeholder="Ej: MT, ED, FDS"
            maxLength={3}
            className="h-8 text-xs uppercase"
          />
          <Button
            onClick={handleAddTurno}
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-3.5" />
            <span className="text-xs">Agregar</span>
          </Button>
        </div>
        {addError && <p className="text-xs text-destructive">{addError}</p>}
      </div>

      <Separator />

      {/* Footer info */}
      <div className="space-y-2 text-[11px] text-muted-foreground/70">
        <p>
          Modifica los horarios de entrada y salida de cada turno. Los cambios se aplicarán a la tabla de horas extras.
        </p>
        <p>
          Los turnos personalizados aparecerán como opciones en el selector de celdas.
        </p>
      </div>
    </div>
  )
}
