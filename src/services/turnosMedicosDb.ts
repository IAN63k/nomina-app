/**
 * turnosMedicosDb — Capa específica de Médicos sobre el motor compartido `recargoEngine`.
 *
 * Define el catálogo de códigos de médicos (M/T/N/L/A), la persistencia contra la
 * tabla `turnos_medicos` y mantiene la API pública que consume `medicos-tab.tsx`.
 */

import { MonthSchedule, ShiftCode } from "@/src/types/schedule"
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser"
import { type RecargoConfig } from "@/src/types/recargo"
import {
  buildMonthsFromRows,
  buildTurnoRows,
  type TurnoRow,
  type TurnosByCode,
} from "@/src/services/recargoEngine"

export type { TurnosByCode }

/** Alias retenido por compatibilidad con los importadores existentes. */
export type TurnoMedicoRow = TurnoRow

const KNOWN_SHIFT_CODES: ShiftCode[] = ["", "M", "T", "N", "L", "A"]

const normalizeShiftCode = (value: string): ShiftCode => {
  const upper = (value ?? "").trim().toUpperCase()
  if (KNOWN_SHIFT_CODES.includes(upper as ShiftCode)) {
    return upper as ShiftCode
  }
  return ""
}

export const mapMonthsToTurnosRows = (
  months: MonthSchedule[],
  turnosByCode?: TurnosByCode,
  recargoConfig?: RecargoConfig,
  conceptoDefault = 0
): TurnoMedicoRow[] => buildTurnoRows(months, { turnosByCode, recargoConfig, conceptoDefault })

/**
 * Filas para la VISTA de detalle. Misma partición por medianoche que el guardado, pero
 * con `splitByTimeRange`: dos tramos del mismo concepto en franjas distintas (p. ej. la
 * cola 00:00–06:00 de la noche anterior y la cabeza 20:00–24:00 de la noche del día)
 * se muestran en filas separadas en vez de fundirse. El guardado en BD sigue agregando
 * por (medico, fecha, concepto) vía `mapMonthsToTurnosRows`.
 */
export const computeDisplayRows = (
  months: MonthSchedule[],
  turnosByCode?: TurnosByCode,
  recargoConfig?: RecargoConfig,
  conceptoDefault = 0
): TurnoMedicoRow[] =>
  buildTurnoRows(months, { turnosByCode, recargoConfig, conceptoDefault, splitByTimeRange: true })

export async function upsertTurnosMedicos(rows: TurnoMedicoRow[]) {
  if (!rows.length) return 0

  // La tabla `turnos_medicos` no tiene columna `festivo` (solo aplica a auxiliares).
  const payload = rows.map((r) => ({
    medico: r.medico,
    documento: r.documento,
    fecha: r.fecha,
    turno_codigo: r.turno_codigo,
    entrada: r.entrada,
    salida: r.salida,
    concepto: r.concepto,
    horas: r.horas,
    horasrecargo: r.horasrecargo,
    diferencia: r.diferencia,
    dia: r.dia,
    mes: r.mes,
    dia_numero: r.dia_numero,
  }))

  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("turnos_medicos")
    .upsert(payload, { onConflict: "medico,fecha,concepto" })

  if (error) {
    throw new Error(error.message)
  }

  return rows.length
}

export async function fetchTurnosMedicos() {
  const supabase = getSupabaseBrowserClient()

  const { data, error } = await supabase
    .from("turnos_medicos")
    .select("medico, documento, fecha, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, created_at")
    .order("fecha", { ascending: true })
    .order("medico", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as TurnoMedicoRow[]
}

export const mapDbRowsToMonths = (rows: TurnoMedicoRow[]): MonthSchedule[] =>
  buildMonthsFromRows(rows, normalizeShiftCode)
