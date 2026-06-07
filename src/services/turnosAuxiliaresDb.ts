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
    // El motor ya calcula festivos por calendario; el "/DF" del Excel los refuerza.
    isFestivo: (cell) => Boolean(cell?.festivo),
  })

/**
 * Filas para la VISTA de detalle (auxiliares). Igual que el guardado pero con
 * `splitByTimeRange`: dos tramos del mismo concepto en franjas distintas dentro de la
 * misma fecha (cola post-medianoche + cabeza de la noche del día) se muestran en filas
 * separadas. El guardado en BD agrega por (medico, fecha, concepto) vía `mapAuxMonthsToTurnosRows`.
 */
export const computeAuxDisplayRows = (
  months: MonthSchedule[],
  turnosByCode?: TurnosByCode,
  recargoConfig?: RecargoConfig,
  conceptoDefault = 0
): TurnoAuxiliarRow[] =>
  buildTurnoRows(months, {
    turnosByCode,
    recargoConfig,
    conceptoDefault,
    isFestivo: (cell) => Boolean(cell?.festivo),
    splitByTimeRange: true,
  })

export async function upsertTurnosAuxiliares(rows: TurnoAuxiliarRow[]) {
  if (!rows.length) return 0

  const payload = rows.map((r) => ({
    medico: r.medico,
    documento: r.documento,
    fecha: r.fecha,
    // Día de inicio del turno: en una noche partida por medianoche difiere de `fecha`
    // (que es la fecha física del tramo). Es el eje de agregación/reconstrucción.
    fecha_inicio: r.fechaInicio,
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
    .upsert(payload, { onConflict: "medico,fecha_inicio,concepto" })

  if (error) {
    throw new Error(error.message)
  }

  return rows.length
}

export async function fetchTurnosAuxiliares() {
  const supabase = getSupabaseBrowserClient()

  // Supabase limita por defecto a 1000 filas por respuesta. Paginamos con `.range`
  // hasta agotar los datos para no perder los meses más recientes (las filas excedentes
  // se descartaban silenciosamente y sus pestañas no aparecían al recargar).
  const PAGE_SIZE = 1000
  const all: TurnoAuxiliarRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("turnos_auxiliares")
      .select("medico, documento, fecha, fecha_inicio, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, festivo, created_at")
      .order("fecha", { ascending: true })
      .order("medico", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(error.message)
    }

    // Mapear la columna snake_case `fecha_inicio` al campo `fechaInicio` del modelo.
    // (Filas previas a la migración no la tienen → fallback a `fecha` en la reconstrucción.)
    const page = (data ?? []).map((r) => {
      const row = r as TurnoAuxiliarRow & { fecha_inicio?: string }
      return { ...row, fechaInicio: row.fecha_inicio ?? row.fecha } as TurnoAuxiliarRow
    })
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return all
}

export const mapDbRowsToAuxMonths = (
  rows: TurnoAuxiliarRow[],
  hoursByCode?: Record<string, number>
): MonthSchedule[] => buildMonthsFromRows(rows, normalizeAuxCode, hoursByCode)
