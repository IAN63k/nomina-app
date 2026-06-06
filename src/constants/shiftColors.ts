/**
 * Resolución de colores de turno en HEX para pintado en runtime.
 *
 * Los catálogos de turnos (src/constants/shifts.ts y auxiliaresShifts.ts) usan clases
 * Tailwind con hex embebido (bg-[#f7e97d], …). Tailwind NO genera clases arbitrarias en
 * runtime, así que para permitir colores personalizables por el usuario resolvemos cada
 * código a valores hex y los pintamos con `style` inline.
 *
 * Un override del usuario solo define el color de FONDO; el texto se calcula por luminancia
 * (claro/oscuro) y el borde se deriva oscureciendo el fondo. Sin override se usan los colores
 * curados por defecto.
 */

export type ShiftModule = "medicos" | "auxiliares"

export type ShiftColorHex = { bg: string; text: string; border: string }

/** Overrides por módulo: code -> hex de fondo. */
export type ShiftColorOverrides = Record<ShiftModule, Record<string, string>>

const TEXT_DARK = "#0f172a" // slate-900
const TEXT_LIGHT = "#f8fafc" // slate-50

/** Defaults curados (replican los catálogos existentes). */
export const DEFAULT_SHIFT_COLORS: Record<ShiftModule, Record<string, ShiftColorHex>> = {
  medicos: {
    M: { bg: "#f7e97d", text: TEXT_DARK, border: "#ead466" },
    T: { bg: "#7bb0ff", text: TEXT_DARK, border: "#5a95ef" },
    N: { bg: "#23355d", text: "#f1f5f9", border: "#1a2a4b" },
    L: { bg: "#ffffff", text: "#64748b", border: "#e2e8f0" },
    A: { bg: "#ffd7d7", text: "#7d1a1a", border: "#f2b0b0" },
  },
  auxiliares: {
    M1: { bg: "#f7e97d", text: TEXT_DARK, border: "#ead466" },
    M2: { bg: "#fbf0a8", text: TEXT_DARK, border: "#efdd84" },
    T1: { bg: "#7bb0ff", text: TEXT_DARK, border: "#5a95ef" },
    T2: { bg: "#a7c9ff", text: TEXT_DARK, border: "#7eaef2" },
    T3: { bg: "#67d4cf", text: TEXT_DARK, border: "#46b8b3" },
    N1: { bg: "#23355d", text: "#f1f5f9", border: "#1a2a4b" },
    N2: { bg: "#3d2a5d", text: "#f1f5f9", border: "#2c1f45" },
    L: { bg: "#ffffff", text: "#64748b", border: "#e2e8f0" },
    V: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
    F: { bg: "#e2e8f0", text: "#334155", border: "#cbd5e1" },
    INCAP: { bg: "#ffd7d7", text: "#7d1a1a", border: "#f2b0b0" },
    INCP: { bg: "#ffd7d7", text: "#7d1a1a", border: "#f2b0b0" },
    CALAM: { bg: "#ffe4c4", text: "#7c4a03", border: "#f5c896" },
  },
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/

function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
}

/** Texto legible (oscuro/claro) según luminancia relativa del fondo. */
export function pickTextColor(bg: string): string {
  const rgb = hexToRgb(bg)
  if (!rgb) return TEXT_DARK
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? TEXT_DARK : TEXT_LIGHT
}

/** Oscurece un hex en `amount` (0–1) para derivar el borde. */
export function darken(hex: string, amount = 0.14): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map((c) => c * (1 - amount))
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export const isValidHex = (value: string): boolean => HEX_RE.test(value.trim())

/**
 * Resuelve el color final de un código. Prioriza override del usuario (deriva texto/borde),
 * luego el default curado, y por último un gris neutro.
 */
export function resolveShiftColor(
  module: ShiftModule,
  code: string,
  overrides?: ShiftColorOverrides
): ShiftColorHex {
  const override = overrides?.[module]?.[code]
  if (override && isValidHex(override)) {
    return { bg: override, text: pickTextColor(override), border: darken(override) }
  }
  const fallback = DEFAULT_SHIFT_COLORS[module]?.[code]
  if (fallback) return fallback
  return { bg: "#e2e8f0", text: TEXT_DARK, border: "#cbd5e1" }
}

export const EMPTY_OVERRIDES: ShiftColorOverrides = { medicos: {}, auxiliares: {} }
