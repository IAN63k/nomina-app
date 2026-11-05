/**
 * Estado de la tarea diaria de alertas (Vercel Cron, 6:00 a. m. Bogotá).
 *
 * En el plan gratuito de Vercel la ejecución puede caer en cualquier momento
 * de esa hora, así que se considera atrasada solo si pasaron más de
 * DIAS_TOLERANCIA días desde la última ejecución exitosa.
 */

export const DIAS_TOLERANCIA = 2
const MS_DIA = 86_400_000

export interface Ejecucion {
  ok: boolean
  created_at: string
  error?: string | null
  nuevas?: number | null
}

export type EstadoTarea =
  | { estado: "al_dia"; ultima: Ejecucion }
  | { estado: "fallo"; ultima: Ejecucion; ultimaExitosa: Ejecucion | null }
  | { estado: "atrasada"; ultimaExitosa: Ejecucion; dias: number }
  | { estado: "nunca" }

/**
 * @param ejecuciones ejecuciones de la tarea diaria (origen "cron"), más reciente primero.
 */
export function estadoTareaDiaria(ejecuciones: Ejecucion[], ahora: Date = new Date()): EstadoTarea {
  if (ejecuciones.length === 0) return { estado: "nunca" }
  const ultima = ejecuciones[0]
  const ultimaExitosa = ejecuciones.find((e) => e.ok) ?? null
  if (!ultima.ok) return { estado: "fallo", ultima, ultimaExitosa }
  const dias = Math.floor((ahora.getTime() - new Date(ultima.created_at).getTime()) / MS_DIA)
  if (dias > DIAS_TOLERANCIA) return { estado: "atrasada", ultimaExitosa: ultima, dias }
  return { estado: "al_dia", ultima }
}
