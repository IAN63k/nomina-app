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
    // Día de inicio del turno (eje de agregación/reconstrucción; difiere de `fecha` en
    // el tramo post-medianoche de una noche partida).
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
  }))

  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("turnos_medicos")
    .upsert(payload, { onConflict: "medico,fecha_inicio,concepto" })

  if (error) {
    throw new Error(error.message)
  }

  return rows.length
}

/**
 * Mueve TODOS los turnos de médicos a la papelera (`turnos_medicos_trash`) y vacía la
 * tabla `turnos_medicos`. La operación es atómica: corre en la función SQL
 * `vaciar_turnos_medicos` (security definer). Devuelve cuántas filas se enviaron a la
 * papelera. `deletedBy` queda registrado en `deleted_by` para auditoría.
 */
export async function deleteTurnosMedicos(deletedBy?: string | null) {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.rpc("vaciar_turnos_medicos", {
    p_deleted_by: deletedBy ?? null,
  })

  if (error) {
    throw new Error(error.message)
  }

  return (data as number | null) ?? 0
}

export type UltimaEliminacion = {
  filas: number
  deletedAt: string
  deletedBy: string | null
}

/**
 * Resumen del último lote enviado a la papelera de médicos (filas, fecha y usuario), o
 * `null` si la papelera está vacía. Sirve para mostrar/ocultar el botón de restaurar.
 */
export async function getUltimaEliminacionMedicos(): Promise<UltimaEliminacion | null> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.rpc("ultima_eliminacion_turnos_medicos")

  if (error) {
    throw new Error(error.message)
  }

  const row = (data as Array<{ filas: number; deleted_at: string; deleted_by: string | null }> | null)?.[0]
  if (!row) return null
  return { filas: Number(row.filas) || 0, deletedAt: row.deleted_at, deletedBy: row.deleted_by }
}

/**
 * Restaura el último lote eliminado (el grupo con el `deleted_at` más reciente) desde
 * `turnos_medicos_trash` de vuelta a `turnos_medicos`. Atómico vía la función SQL
 * `restaurar_turnos_medicos`. Devuelve cuántas filas se restauraron.
 */
export async function restaurarTurnosMedicos() {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.rpc("restaurar_turnos_medicos")

  if (error) {
    throw new Error(error.message)
  }

  return (data as number | null) ?? 0
}

export async function fetchTurnosMedicos() {
  const supabase = getSupabaseBrowserClient()

  // Supabase limita por defecto a 1000 filas por respuesta. Paginamos con `.range`
  // hasta agotar los datos para no perder los meses más recientes.
  const PAGE_SIZE = 1000
  const all: TurnoMedicoRow[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("turnos_medicos")
      .select("medico, documento, fecha, fecha_inicio, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, created_at")
      .order("fecha", { ascending: true })
      .order("medico", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(error.message)
    }

    // Mapear `fecha_inicio` (snake) → `fechaInicio` (modelo). Filas previas a la
    // migración no la tienen → fallback a `fecha` en la reconstrucción.
    const page = (data ?? []).map((r) => {
      const row = r as TurnoMedicoRow & { fecha_inicio?: string }
      return { ...row, fechaInicio: row.fecha_inicio ?? row.fecha } as TurnoMedicoRow
    })
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return all
}

export const mapDbRowsToMonths = (
  rows: TurnoMedicoRow[],
  hoursByCode?: Record<string, number>
): MonthSchedule[] => buildMonthsFromRows(rows, normalizeShiftCode, hoursByCode)
