import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/src/lib/requireSession"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"
import { validarImportacion } from "@/src/services/colaboradoresValidacion"
import { listaFondos } from "@/src/lib/colaboradoresDb"

/**
 * Importa el listado (upsert por cédula): agrega nuevos y actualiza nombre,
 * cargo, sede y fondo de pensiones. No borra colaboradores; un dato vacío en
 * el archivo no borra el que ya estaba.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession(req, "editar_colaboradores")
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }
  const db = getSupabaseServerClient()
  let fondos: string[]
  try {
    fondos = await listaFondos(db)
  } catch (e) {
    console.error("POST /api/colaboradores/importar (fondos):", (e as Error).message)
    return NextResponse.json({ error: "No se pudo leer la lista de fondos." }, { status: 500 })
  }
  const v = validarImportacion(body, fondos)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await db.rpc("colaboradores_importar", {
    p_usuario: auth.user.usuario,
    p_archivo: v.valor.archivo,
    p_colaboradores: v.valor.colaboradores.map((c) => ({
      identificacion: c.cedula, nombre: c.nombre, cargo: c.cargo, sede: c.sede, fondo_pensiones: c.fondoPensiones,
    })),
  })
  if (error) {
    console.error("POST /api/colaboradores/importar:", error.message)
    return NextResponse.json({ error: "No se pudo guardar el listado." }, { status: 500 })
  }
  return NextResponse.json({ ...data, fondos_no_reconocidos: v.valor.fondosNoReconocidos })
}
