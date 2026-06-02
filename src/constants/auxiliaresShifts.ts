/**
 * Catálogo de turnos de Auxiliares.
 *
 * Derivado de la leyenda embebida en el Excel de auxiliares. Los códigos con horario
 * (M1, M2, T1, T2, T3, N1, N2) alimentan el cálculo de recargos; los códigos de
 * ausencia (L, V, F, INCAP, INCP, CALAM) no generan recargo (sin horario).
 */

export type AuxTurnoDetail = {
  label: string
  bg: string
  text: string
  border: string
  description: string
}

/** Códigos seleccionables/visibles en la tabla (orden de presentación). */
export const AUX_SHIFT_CODES: string[] = [
  "M1",
  "M2",
  "T1",
  "T2",
  "T3",
  "N1",
  "N2",
  "L",
  "V",
  "F",
  "INCAP",
  "INCP",
  "CALAM",
]

export const AUX_SHIFT_DETAILS: Record<string, AuxTurnoDetail> = {
  M1: { label: "Mañana 1", bg: "bg-[#f7e97d]", text: "text-slate-900", border: "border-[#ead466]", description: "Mañana 06:00–13:00" },
  M2: { label: "Mañana 2", bg: "bg-[#fbf0a8]", text: "text-slate-900", border: "border-[#efdd84]", description: "Mañana 08:00–14:00" },
  T1: { label: "Tarde 1", bg: "bg-[#7bb0ff]", text: "text-slate-900", border: "border-[#5a95ef]", description: "Tarde 14:00–21:00" },
  T2: { label: "Tarde 2", bg: "bg-[#a7c9ff]", text: "text-slate-900", border: "border-[#7eaef2]", description: "Tarde 14:00–20:00" },
  T3: { label: "Tarde 3", bg: "bg-[#67d4cf]", text: "text-slate-900", border: "border-[#46b8b3]", description: "Tarde 13:00–20:00" },
  N1: { label: "Noche 1", bg: "bg-[#23355d]", text: "text-slate-100", border: "border-[#1a2a4b]", description: "Noche 21:00–06:00" },
  N2: { label: "Noche 2", bg: "bg-[#3d2a5d]", text: "text-slate-100", border: "border-[#2c1f45]", description: "Noche 22:00–06:00" },
  L: { label: "Libre", bg: "bg-white", text: "text-slate-500", border: "border-slate-200", description: "Día libre" },
  V: { label: "Vacaciones", bg: "bg-[#dcfce7]", text: "text-[#166534]", border: "border-[#bbf7d0]", description: "Vacaciones" },
  F: { label: "Festivo/Descanso", bg: "bg-[#e2e8f0]", text: "text-slate-700", border: "border-slate-300", description: "Festivo o descanso" },
  INCAP: { label: "Incapacidad", bg: "bg-[#ffd7d7]", text: "text-[#7d1a1a]", border: "border-[#f2b0b0]", description: "Incapacidad" },
  INCP: { label: "Incapacidad", bg: "bg-[#ffd7d7]", text: "text-[#7d1a1a]", border: "border-[#f2b0b0]", description: "Incapacidad" },
  CALAM: { label: "Calamidad", bg: "bg-[#ffe4c4]", text: "text-[#7c4a03]", border: "border-[#f5c896]", description: "Calamidad doméstica" },
}

export const AUX_SHIFT_COLOR_BY_CODE: Record<string, { bg: string; text: string; border: string }> = {
  "": { bg: "bg-white", text: "text-slate-500", border: "border-slate-200" },
  ...Object.fromEntries(Object.entries(AUX_SHIFT_DETAILS).map(([code, d]) => [code, { bg: d.bg, text: d.text, border: d.border }])),
}

export const AUX_SHIFT_DEFAULT_HOURS: Record<string, number> = {
  M1: 7,
  M2: 6,
  T1: 7,
  T2: 6,
  T3: 7,
  N1: 8,
  N2: 7,
  L: 0,
  V: 0,
  F: 0,
  INCAP: 0,
  INCP: 0,
  CALAM: 0,
}

/** Configuración de turnos por defecto para el contexto editable. */
export type AuxTurnoConfig = {
  entrada: string
  salida: string
  total: string
  descripcion: string
}

export const AUX_DEFAULT_CODES: string[] = [...AUX_SHIFT_CODES]

export const AUX_DEFAULT_TURNOS: Record<string, AuxTurnoConfig> = {
  M1: { entrada: "06:00", salida: "13:00", total: "7", descripcion: AUX_SHIFT_DETAILS.M1.description },
  M2: { entrada: "08:00", salida: "14:00", total: "6", descripcion: AUX_SHIFT_DETAILS.M2.description },
  T1: { entrada: "14:00", salida: "21:00", total: "7", descripcion: AUX_SHIFT_DETAILS.T1.description },
  T2: { entrada: "14:00", salida: "20:00", total: "6", descripcion: AUX_SHIFT_DETAILS.T2.description },
  T3: { entrada: "13:00", salida: "20:00", total: "7", descripcion: AUX_SHIFT_DETAILS.T3.description },
  N1: { entrada: "21:00", salida: "06:00", total: "8", descripcion: AUX_SHIFT_DETAILS.N1.description },
  N2: { entrada: "22:00", salida: "06:00", total: "7", descripcion: AUX_SHIFT_DETAILS.N2.description },
  L: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.L.description },
  V: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.V.description },
  F: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.F.description },
  INCAP: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.INCAP.description },
  INCP: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.INCP.description },
  CALAM: { entrada: "", salida: "", total: "0", descripcion: AUX_SHIFT_DETAILS.CALAM.description },
}

/** Códigos que se consideran ausencia (sin recargo). */
export const AUX_ABSENCE_CODES = new Set(["L", "V", "F", "INCAP", "INCP", "CALAM"])

const KNOWN_AUX_CODES = new Set(AUX_SHIFT_CODES)

/** Valida/normaliza un código ya resuelto (M1, T1, N1, L, …). Desconocido → "". */
export const normalizeAuxCode = (value: string): string => {
  const upper = (value ?? "").trim().toUpperCase()
  return KNOWN_AUX_CODES.has(upper) ? upper : ""
}
