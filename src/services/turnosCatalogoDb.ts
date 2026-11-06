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

import { apiJson } from "@/src/lib/apiCliente"

export type CatalogoModulo = "medicos" | "auxiliares"

export type TurnoCatalogoConfig = {
  entrada: string
  salida: string
  total: string
  descripcion: string
}

// Vía app/api/turnos/catalogo/[modulo] (sesión firmada y rol); el navegador ya
// no escribe directo en la tabla `turnos_catalogo`.
const api = (modulo: CatalogoModulo) => `/api/turnos/catalogo/${modulo}`

export async function fetchTurnosCatalogo(
  modulo: CatalogoModulo
): Promise<Record<string, TurnoCatalogoConfig>> {
  return apiJson<Record<string, TurnoCatalogoConfig>>(api(modulo))
}

export async function upsertTurnoCatalogo(
  modulo: CatalogoModulo,
  codigo: string,
  config: TurnoCatalogoConfig
): Promise<void> {
  await apiJson(api(modulo), { method: "PUT", body: { codigo, config } })
}

export async function deleteTurnoCatalogo(modulo: CatalogoModulo, codigo: string): Promise<void> {
  await apiJson(`${api(modulo)}?codigo=${encodeURIComponent(codigo)}`, { method: "DELETE" })
}

/** Purga todos los turnos personalizados de un módulo (usado por "Restaurar valores por defecto"). */
export async function deleteAllTurnosCatalogo(modulo: CatalogoModulo): Promise<void> {
  await apiJson(api(modulo), { method: "DELETE" })
}
