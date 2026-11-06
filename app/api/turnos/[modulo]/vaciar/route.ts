import { NextResponse } from "next/server"
import { ruta } from "@/src/lib/apiIncapacidades"
import { auditar } from "@/src/lib/incapacidadesDb"
import { exigirModulo, rpcTurnos } from "@/src/lib/turnosDb"

/**
 * Envía TODOS los turnos del módulo a la papelera (función SQL atómica). Solo
 * el administrador. "Eliminado por" se toma de la sesión, no del navegador.
 */
export const POST = ruta<{ modulo: string }>("vaciar_turnos", async ({ db, user }, { modulo }) => {
  const m = exigirModulo(modulo)
  const filas = (await rpcTurnos<number | null>(db, `vaciar_turnos_${m}`, { p_deleted_by: user.usuario })) ?? 0
  await auditar(db, [{ tabla: `turnos_${m}`, registro_id: "*", accion: "vaciar", valor_nuevo: { filas }, usuario: user.usuario }])
  return NextResponse.json({ filas })
})
