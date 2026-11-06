import { NextResponse } from "next/server"
import { ruta } from "@/src/lib/apiIncapacidades"
import { exigirModulo, rpcTurnos } from "@/src/lib/turnosDb"

/** Último lote enviado a la papelera (filas, fecha y usuario), o null si está vacía. */
export const GET = ruta<{ modulo: string }>("ver_turnos", async ({ db }, { modulo }) => {
  const m = exigirModulo(modulo)
  const data = await rpcTurnos<Array<{ filas: number; deleted_at: string; deleted_by: string | null }> | null>(db, `ultima_eliminacion_turnos_${m}`)
  const fila = data?.[0]
  return NextResponse.json(fila ? { filas: Number(fila.filas) || 0, deletedAt: fila.deleted_at, deletedBy: fila.deleted_by } : null)
})
