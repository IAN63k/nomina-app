/**
 * turnosAuxiliaresDb — Capa específica de Auxiliares sobre el motor `recargoEngine`.
 *
 * Reutiliza exactamente la misma lógica de recargo y partición por medianoche que
 * Médicos, añadiendo el manejo de festivos (códigos "/DF"): un día festivo se calcula
 * con las ventanas dominicales (conceptos 35/39). Persiste en la tabla `turnos_auxiliares`.
 */

import { MonthSchedule } from "@/src/types/schedule"
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser"
import { type RecargoConfig } from "@/src/types/recargo"
import { normalizeAuxCode } from "@/src/constants/auxiliaresShifts"
import {
  buildMonthsFromRows,
  buildTurnoRows,
  diaFromDate,
  type TurnoRow,
  type TurnosByCode,
} from "@/src/services/recargoEngine"

export type { TurnosByCode }

export type TurnoAuxiliarRow = TurnoRow

export const mapAuxMonthsToTurnosRows = (
  months: MonthSchedule[],
  turnosByCode?: TurnosByCode,
  recargoConfig?: RecargoConfig,
  conceptoDefault = 0
): TurnoAuxiliarRow[] =>
  buildTurnoRows(months, {
    turnosByCode,
    recargoConfig,
    conceptoDefault,
    // Festivo (/DF) → se calcula como dominical (conceptos 35/39).
    getEffectiveDia: (date, cell) => (cell?.festivo ? "D" : diaFromDate(date)),
    isFestivo: (cell) => Boolean(cell?.festivo),
  })

/**
 * Alias retenido por consistencia con médicos: la tabla de detalle y el TXT usan la
 * misma partición por medianoche que el guardado en BD.
 */
export const computeAuxDisplayRows = mapAuxMonthsToTurnosRows

export async function upsertTurnosAuxiliares(rows: TurnoAuxiliarRow[]) {
  if (!rows.length) return 0

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
    festivo: Boolean(r.festivo),
  }))

  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("turnos_auxiliares")
    .upsert(payload, { onConflict: "medico,fecha" })

  if (error) {
    throw new Error(error.message)
  }

  return rows.length
}

export async function fetchTurnosAuxiliares() {
  const supabase = getSupabaseBrowserClient()

  const { data, error } = await supabase
    .from("turnos_auxiliares")
    .select("medico, documento, fecha, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, festivo, created_at")
    .order("fecha", { ascending: true })
    .order("medico", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as TurnoAuxiliarRow[]
}

export const mapDbRowsToAuxMonths = (rows: TurnoAuxiliarRow[]): MonthSchedule[] =>
  buildMonthsFromRows(rows, normalizeAuxCode)
