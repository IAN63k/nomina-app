/**
 * turnosCatalogoDb — Persistencia en Supabase del catálogo de turnos personalizados
 * (creados vía "Agregar un turno personalizado" en Ajustes → Turnos).
 *
 * Sin esto, un turno personalizado (código, entrada, salida, total) solo vivía en el
 * estado de React de `MedicosTurnosContext`/`AuxiliaresTurnosContext` y se perdía en
 * cada recarga de página: `recargoEngine.splitTurnoTimes` no podía resolver su horario
 * (turnosByCode[codigo] ausente) y el turno quedaba con 0 horas, sin recargo ni extra,
 * aunque estuviera asignado en la malla y guardado en `turnos_medicos`/`turnos_auxiliares`.
 *
 * Tabla `turnos_catalogo` (modulo, codigo) → entrada/salida/total/descripcion.
 * Compartida por todos los usuarios (no es una preferencia personal, ver
 * `userPreferences.ts`): el catálogo interpreta datos ya guardados y debe ser el mismo
 * para todos. Solo se persisten los turnos personalizados, no los del catálogo por
 * defecto de cada módulo.
 */

import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser"

export type CatalogoModulo = "medicos" | "auxiliares"

export type TurnoCatalogoConfig = {
  entrada: string
  salida: string
  total: string
  descripcion: string
}

const TABLE = "turnos_catalogo"

export async function fetchTurnosCatalogo(
  modulo: CatalogoModulo
): Promise<Record<string, TurnoCatalogoConfig>> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("codigo, entrada, salida, total, descripcion")
    .eq("modulo", modulo)

  if (error) throw new Error(error.message)

  const result: Record<string, TurnoCatalogoConfig> = {}
  for (const row of data ?? []) {
    result[row.codigo as string] = {
      entrada: (row.entrada as string) ?? "",
      salida: (row.salida as string) ?? "",
      total: (row.total as string) ?? "0",
      descripcion: (row.descripcion as string) ?? "",
    }
  }
  return result
}

export async function upsertTurnoCatalogo(
  modulo: CatalogoModulo,
  codigo: string,
  config: TurnoCatalogoConfig
): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { modulo, codigo, ...config, updated_at: new Date().toISOString() },
      { onConflict: "modulo,codigo" }
    )
  if (error) throw new Error(error.message)
}

export async function deleteTurnoCatalogo(modulo: CatalogoModulo, codigo: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from(TABLE).delete().eq("modulo", modulo).eq("codigo", codigo)
  if (error) throw new Error(error.message)
}

/** Purga todos los turnos personalizados de un módulo (usado por "Restaurar valores por defecto"). */
export async function deleteAllTurnosCatalogo(modulo: CatalogoModulo): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from(TABLE).delete().eq("modulo", modulo)
  if (error) throw new Error(error.message)
}
