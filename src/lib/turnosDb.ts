import type { SupabaseClient } from "@supabase/supabase-js"
import { ErrorHttp } from "@/src/lib/apiIncapacidades"
import { esModulo, type ModuloTurnos } from "@/src/services/turnosValidacion"

/** Acceso a turnos de Recargos desde el servidor (service role). */

export const TABLA_TURNOS: Record<ModuloTurnos, string> = { medicos: "turnos_medicos", auxiliares: "turnos_auxiliares" }

export const COLUMNAS_TURNOS: Record<ModuloTurnos, string> = {
  medicos: "medico, documento, fecha, fecha_inicio, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, created_at",
  auxiliares: "medico, documento, fecha, fecha_inicio, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, festivo, created_at",
}

export const PAGINA_TURNOS = 1000

export function exigirModulo(m: string): ModuloTurnos {
  if (!esModulo(m)) throw new ErrorHttp(400, "Módulo no válido (medicos o auxiliares)")
  return m
}

/** Llama una función SQL de la papelera (vaciar/restaurar/última eliminación). */
export async function rpcTurnos<T>(db: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
