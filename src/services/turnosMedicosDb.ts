/**
 * turnosMedicosDb — Capa específica de Médicos sobre el motor compartido `recargoEngine`.
 *
 * Define el catálogo de códigos de médicos (M/T/N/L/A), la persistencia contra la
 * tabla `turnos_medicos` y mantiene la API pública que consume `medicos-tab.tsx`.
 */

import { MonthSchedule, ShiftCode } from "@/src/types/schedule"
import { apiJson } from "@/src/lib/apiCliente"
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

/**
 * `extraCodes`: turnos personalizados vigentes (`MedicosTurnosContext.turnosCodes`).
 * Sin esto, un código como "ET" se pierde al recargar desde BD (la celda queda con
 * código "" y sus horas pasan como concepto 0 "sin turno", que no participa del tope
 * semanal ni genera hora extra aunque esté correctamente configurado y asignado).
 */
const normalizeShiftCode = (value: string, extraCodes?: Iterable<string>): string => {
  const upper = (value ?? "").trim().toUpperCase()
  if (KNOWN_SHIFT_CODES.includes(upper as ShiftCode)) {
    return upper
  }
  if (extraCodes) {
    for (const code of extraCodes) {
      if ((code ?? "").trim().toUpperCase() === upper) return upper
    }
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

// ─── Persistencia (vía app/api/turnos/medicos: sesión firmada y rol) ───────────
// El navegador ya no habla directo con Supabase. Lecturas y guardados van por
// páginas/lotes de 1000 filas para no acercarse al límite de cuerpo de Vercel.

const API = "/api/turnos/medicos"
const LOTE = 1000

export async function upsertTurnosMedicos(rows: TurnoMedicoRow[]) {
  if (!rows.length) return 0
  // Solo las columnas que se guardan (el servidor vuelve a validar con lista blanca).
  const payload = rows.map((r) => ({
    medico: r.medico,
    documento: r.documento,
    fecha: r.fecha,
    // Día de inicio del turno (difiere de `fecha` en el tramo post-medianoche).
    fechaInicio: r.fechaInicio,
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
  for (let i = 0; i < payload.length; i += LOTE) {
    await apiJson(API, { method: "POST", body: { filas: payload.slice(i, i + LOTE) } })
  }
  return rows.length
}

/**
 * Envía TODOS los turnos del módulo a la papelera y vacía la tabla (función SQL
 * atómica en el servidor). Solo el administrador. `deletedBy` se conserva por
 * compatibilidad, pero el servidor registra el usuario de la sesión.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteTurnosMedicos(deletedBy?: string | null) {
  const r = await apiJson<{ filas: number }>(`${API}/vaciar`, { method: "POST" })
  return r.filas ?? 0
}

export type UltimaEliminacion = {
  filas: number
  deletedAt: string
  deletedBy: string | null
}

/** Último lote enviado a la papelera (filas, fecha y usuario), o `null` si está vacía. */
export async function getUltimaEliminacionMedicos(): Promise<UltimaEliminacion | null> {
  return apiJson<UltimaEliminacion | null>(`${API}/papelera`)
}

/** Restaura el último lote eliminado desde la papelera (atómico en el servidor). Solo el administrador. */
export async function restaurarTurnosMedicos() {
  const r = await apiJson<{ filas: number }>(`${API}/restaurar`, { method: "POST" })
  return r.filas ?? 0
}

export async function fetchTurnosMedicos() {
  const all: TurnoMedicoRow[] = []
  for (let desde: number | null = 0; desde !== null; ) {
    const r: { filas: Array<TurnoMedicoRow & { fecha_inicio?: string }>; siguiente: number | null } =
      await apiJson(`${API}?desde=${desde}`)
    // `fecha_inicio` (BD) → `fechaInicio` (modelo); filas previas a la migración usan `fecha`.
    all.push(...r.filas.map((row) => ({ ...row, fechaInicio: row.fecha_inicio ?? row.fecha })))
    desde = r.siguiente
  }
  return all
}

export const mapDbRowsToMonths = (
  rows: TurnoMedicoRow[],
  hoursByCode?: Record<string, number>,
  customCodes?: Iterable<string>
): MonthSchedule[] => buildMonthsFromRows(rows, (value) => normalizeShiftCode(value, customCodes), hoursByCode)
