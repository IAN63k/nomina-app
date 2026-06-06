"use client"

import { Check, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { THEMES, useAppearance } from "@/contexts/appearance-context"
import { SHIFT_DETAILS } from "@/src/constants/shifts"
import { AUX_SHIFT_DETAILS } from "@/src/constants/auxiliaresShifts"
import { DEFAULT_SHIFT_COLORS, type ShiftModule } from "@/src/constants/shiftColors"

const MODULES: { id: ShiftModule; label: string; details: Record<string, { label: string }> }[] = [
  { id: "medicos", label: "Médicos", details: SHIFT_DETAILS },
  { id: "auxiliares", label: "Auxiliares", details: AUX_SHIFT_DETAILS },
]

export function AppearancePanel() {
  const {
    theme,
    gradient,
    shiftColors,
    setTheme,
    setGradient,
    setShiftColor,
    resetShiftColor,
    resetAllShiftColors,
    colorOf,
  } = useAppearance()

  const hasOverrides =
    Object.keys(shiftColors.medicos).length > 0 || Object.keys(shiftColors.auxiliares).length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* Tema */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tema</h3>
          <p className="text-xs text-muted-foreground">Aplica a toda la aplicación y se recuerda.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const active = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black/10"
                  style={{ backgroundColor: t.swatch }}
                >
                  {active ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <Separator />

      {/* Fondo en degradado */}
      <section className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Fondo en degradado</h3>
          <p className="text-xs text-muted-foreground">Tinte sutil derivado del tema.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={gradient}
          onClick={() => setGradient(!gradient)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            gradient ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              gradient ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </section>

      <Separator />

      {/* Colores de turno */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Colores de turno</h3>
            <p className="text-xs text-muted-foreground">El texto y el borde se ajustan solos.</p>
          </div>
          {hasOverrides ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetAllShiftColors}>
              <RotateCcw className="h-3 w-3" />
              Restablecer
            </Button>
          ) : null}
        </div>

        {MODULES.map((mod) => (
          <div key={mod.id} className="flex flex-col gap-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {mod.label}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(DEFAULT_SHIFT_COLORS[mod.id]).map((code) => {
                const resolved = colorOf(mod.id, code)
                const overridden = Boolean(shiftColors[mod.id]?.[code])
                const label = mod.details[code]?.label ?? code
                return (
                  <div
                    key={code}
                    className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
                    title={label}
                  >
                    <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded border border-black/10">
                      <span className="absolute inset-0" style={{ backgroundColor: resolved.bg }} />
                      <input
                        type="color"
                        aria-label={`Color del turno ${code} (${label})`}
                        value={resolved.bg}
                        onChange={(e) => setShiftColor(mod.id, code, e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">
                      {code}
                    </span>
                    {overridden ? (
                      <button
                        type="button"
                        aria-label={`Restablecer color de ${code}`}
                        onClick={() => resetShiftColor(mod.id, code)}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
