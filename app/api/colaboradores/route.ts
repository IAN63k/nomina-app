import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/src/lib/requireSession"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"
import { listaFondos, listarColaboradores } from "@/src/lib/colaboradoresDb"

/** Maestro de colaboradores + lista de fondos de pensiones válidos. */
export async function GET(req: NextRequest) {
  const auth = await requireSession(req, "ver_colaboradores")
  if (!auth.ok) return auth.response
  try {
    const db = getSupabaseServerClient(auth.user)
    const [colaboradores, fondos] = await Promise.all([listarColaboradores(db), listaFondos(db)])
    return NextResponse.json({ colaboradores, fondos })
  } catch (e) {
    console.error("GET /api/colaboradores:", (e as Error).message)
    return NextResponse.json({ error: "No se pudo leer el listado de colaboradores." }, { status: 500 })
  }
}
