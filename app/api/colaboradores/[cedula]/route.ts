import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/src/lib/requireSession"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"
import { listaFondos, obtenerColaborador } from "@/src/lib/colaboradoresDb"
import { validarEdicion } from "@/src/services/colaboradoresValidacion"
import { IDENTIFICACION_VALIDA } from "@/src/types/colaborador"

const CAMPO_APP: Record<string, string> = { fondo_pensiones: "fondoPensiones" }

/** Edita cargo, sede, fondo de pensiones o activo de un colaborador, con auditoría. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ cedula: string }> }) {
  const auth = await requireSession(req, "editar_colaboradores")
  if (!auth.ok) return auth.response

  const { cedula } = await ctx.params
  if (!IDENTIFICACION_VALIDA.test(cedula)) return NextResponse.json({ error: "Cédula inválida" }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const db = getSupabaseServerClient(auth.user)
  try {
    const v = validarEdicion(body, await listaFondos(db))
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const antes = await obtenerColaborador(db, cedula)
    if (!antes) return NextResponse.json({ error: "Colaborador no encontrado" }, { status: 404 })

    const { error } = await db
      .from("colaboradores")
      .update({ ...v.valor, updated_by: auth.user.usuario, updated_at: new Date().toISOString() })
      .eq("identificacion", cedula)
    if (error) throw new Error(error.message)

    const auditoria = Object.entries(v.valor).map(([campo, nuevo]) => ({
      tabla: "colaboradores",
      registro_id: cedula,
      accion: "update",
      campo,
      valor_anterior: (antes as unknown as Record<string, unknown>)[CAMPO_APP[campo] ?? campo] ?? null,
      valor_nuevo: nuevo,
      usuario: auth.user.usuario,
    }))
    const { error: errAud } = await db.from("incapacidad_auditoria").insert(auditoria)
    if (errAud) console.error("Auditoría colaboradores:", errAud.message)

    return NextResponse.json(await obtenerColaborador(db, cedula))
  } catch (e) {
    console.error("PATCH /api/colaboradores:", (e as Error).message)
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 500 })
  }
}
