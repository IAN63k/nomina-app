import { NextResponse } from "next/server"
import { ruta } from "@/src/lib/apiIncapacidades"
import { auditar } from "@/src/lib/incapacidadesDb"
import { exigirModulo, rpcTurnos } from "@/src/lib/turnosDb"

/** Restaura el último lote de la papelera (función SQL atómica). Solo el administrador. */
export const POST = ruta<{ modulo: string }>("vaciar_turnos", async ({ db, user }, { modulo }) => {
  const m = exigirModulo(modulo)
  const filas = (await rpcTurnos<number | null>(db, `restaurar_turnos_${m}`)) ?? 0
  await auditar(db, [{ tabla: `turnos_${m}`, registro_id: "*", accion: "restaurar", valor_nuevo: { filas }, usuario: user.usuario }])
  return NextResponse.json({ filas })
})
