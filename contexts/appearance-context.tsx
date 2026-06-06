"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import {
  EMPTY_OVERRIDES,
  isValidHex,
  resolveShiftColor,
  type ShiftColorHex,
  type ShiftColorOverrides,
  type ShiftModule,
} from "@/src/constants/shiftColors"

export type ThemeId = "soft" | "dark" | "teal" | "violet"

export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: "soft", label: "Claro suave", swatch: "#f6f5f1" },
  { id: "dark", label: "Oscuro", swatch: "#1f2430" },
  { id: "teal", label: "Azul / Teal", swatch: "#0891b2" },
  { id: "violet", label: "Violeta / Esmeralda", swatch: "#7c5cdb" },
]

export const DEFAULT_THEME: ThemeId = "soft"

const STORAGE_KEY = "nomina-appearance"

type StoredAppearance = {
  theme: ThemeId
  gradient: boolean
  shiftColors: ShiftColorOverrides
}

type AppearanceContextType = {
  theme: ThemeId
  gradient: boolean
  shiftColors: ShiftColorOverrides
  setTheme: (theme: ThemeId) => void
  setGradient: (enabled: boolean) => void
  setShiftColor: (module: ShiftModule, code: string, hex: string) => void
  resetShiftColor: (module: ShiftModule, code: string) => void
  resetAllShiftColors: () => void
  /** Resuelve el color final de un código (override del usuario o default). */
  colorOf: (module: ShiftModule, code: string) => ShiftColorHex
}

const AppearanceContext = createContext<AppearanceContextType | null>(null)

const isThemeId = (value: unknown): value is ThemeId =>
  value === "soft" || value === "dark" || value === "teal" || value === "violet"

function readStored(): StoredAppearance | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAppearance>
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_THEME,
      gradient: Boolean(parsed.gradient),
      shiftColors: {
        medicos: { ...(parsed.shiftColors?.medicos ?? {}) },
        auxiliares: { ...(parsed.shiftColors?.auxiliares ?? {}) },
      },
    }
  } catch {
    return null
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME)
  const [gradient, setGradientState] = useState(false)
  const [shiftColors, setShiftColors] = useState<ShiftColorOverrides>(EMPTY_OVERRIDES)
  const [hydrated, setHydrated] = useState(false)

  // Hidratar desde localStorage tras el montaje (el script inline ya pintó el tema sin flash).
  useEffect(() => {
    const stored = readStored()
    if (stored) {
      setThemeState(stored.theme)
      setGradientState(stored.gradient)
      setShiftColors(stored.shiftColors)
    }
    setHydrated(true)
  }, [])

  // Aplicar tema + gradiente al documento.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.classList.toggle("dark", theme === "dark")
    root.classList.toggle("app-gradient", gradient)
  }, [theme, gradient])

  // Persistir.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, gradient, shiftColors }))
    } catch {
      // almacenamiento no disponible: ignorar
    }
  }, [theme, gradient, shiftColors, hydrated])

  const setShiftColor = (module: ShiftModule, code: string, hex: string) => {
    if (!isValidHex(hex)) return
    setShiftColors((prev) => ({
      ...prev,
      [module]: { ...prev[module], [code]: hex },
    }))
  }

  const resetShiftColor = (module: ShiftModule, code: string) => {
    setShiftColors((prev) => {
      const next = { ...prev[module] }
      delete next[code]
      return { ...prev, [module]: next }
    })
  }

  const resetAllShiftColors = () => setShiftColors(EMPTY_OVERRIDES)

  const value = useMemo<AppearanceContextType>(
    () => ({
      theme,
      gradient,
      shiftColors,
      setTheme: setThemeState,
      setGradient: setGradientState,
      setShiftColor,
      resetShiftColor,
      resetAllShiftColors,
      colorOf: (module, code) => resolveShiftColor(module, code, shiftColors),
    }),
    [theme, gradient, shiftColors]
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance() {
  const context = useContext(AppearanceContext)
  if (!context) {
    throw new Error("useAppearance debe usarse dentro de AppearanceProvider")
  }
  return context
}
