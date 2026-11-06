/**
 * turnosAuxiliaresDb — Capa específica de Auxiliares sobre el motor `recargoEngine`.
 *
 * Reutiliza exactamente la misma lógica de recargo y partición por medianoche que
 * Médicos, añadiendo el manejo de festivos (códigos "/DF"): un día festivo se calcula
 * con las ventanas dominicales (concepto 35 nocturno, 39/40 diurno según sea domingo o
 * festivo). Persiste en la tabla `turnos_auxiliares`.
 */

import { MonthSchedule } from "@/src/types/schedule"
import { apiJson } from "@/src/lib/apiCliente"
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

// ─── Persistencia (vía app/api/turnos/auxiliares: sesión firmada y rol) ───────────
// El navegador ya no habla directo con Supabase. Lecturas y guardados van por
// páginas/lotes de 1000 filas para no acercarse al límite de cuerpo de Vercel.

const API = "/api/turnos/auxiliares"
const LOTE = 1000

export async function upsertTurnosAuxiliares(rows: TurnoAuxiliarRow[]) {
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
    festivo: Boolean(r.festivo),
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
export async function deleteTurnosAuxiliares(deletedBy?: string | null) {
  const r = await apiJson<{ filas: number }>(`${API}/vaciar`, { method: "POST" })
  return r.filas ?? 0
}

export type UltimaEliminacion = {
  filas: number
  deletedAt: string
  deletedBy: string | null
}

/** Último lote enviado a la papelera (filas, fecha y usuario), o `null` si está vacía. */
export async function getUltimaEliminacionAuxiliares(): Promise<UltimaEliminacion | null> {
  return apiJson<UltimaEliminacion | null>(`${API}/papelera`)
}

/** Restaura el último lote eliminado desde la papelera (atómico en el servidor). Solo el administrador. */
export async function restaurarTurnosAuxiliares() {
  const r = await apiJson<{ filas: number }>(`${API}/restaurar`, { method: "POST" })
  return r.filas ?? 0
}

export async function fetchTurnosAuxiliares() {
  const all: TurnoAuxiliarRow[] = []
  for (let desde: number | null = 0; desde !== null; ) {
    const r: { filas: Array<TurnoAuxiliarRow & { fecha_inicio?: string }>; siguiente: number | null } =
      await apiJson(`${API}?desde=${desde}`)
    // `fecha_inicio` (BD) → `fechaInicio` (modelo); filas previas a la migración usan `fecha`.
    all.push(...r.filas.map((row) => ({ ...row, fechaInicio: row.fecha_inicio ?? row.fecha })))
    desde = r.siguiente
  }
  return all
}

/**
 * `customCodes`: turnos personalizados vigentes (`AuxiliaresTurnosContext.turnosCodes`).
 * Sin esto, `normalizeAuxCode` no reconoce un código como "ET" y la celda se recarga con
 * código "" (perdiendo la asignación) aunque esté guardado en `turnos_auxiliares`.
 */
export const mapDbRowsToAuxMonths = (
  rows: TurnoAuxiliarRow[],
  hoursByCode?: Record<string, number>,
  customCodes?: Iterable<string>
): MonthSchedule[] => buildMonthsFromRows(rows, (value) => normalizeAuxCode(value, customCodes), hoursByCode)
