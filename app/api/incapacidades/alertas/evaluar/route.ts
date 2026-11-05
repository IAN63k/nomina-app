import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { requireSession } from "@/src/lib/requireSession"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"
import { evaluarAlertas } from "@/src/lib/incapacidadesDb"

/**
 * Evalúa hitos de 90/120/150/180 días (y previas) y PQRD vencidas con la
 * fecha de corte. Idempotente: solo inserta alertas nuevas.
 *
 * La puede llamar un usuario con sesión (botón "Evaluar ahora") o la tarea
 * diaria (Vercel Cron) con `Authorization: Bearer $CRON_SECRET`.
 */
function esCron(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!secreto || secreto.length < 16) return false
  const esperado = Buffer.from(`Bearer ${secreto}`)
  const recibido = Buffer.from(auth)
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
}

async function manejar(req: NextRequest) {
  if (!esCron(req)) {
    const auth = await requireSession(req, "atender_alerta")
    if (!auth.ok) return auth.response
  }
  try {
    return NextResponse.json(await evaluarAlertas(getSupabaseServerClient()))
  } catch (e) {
    console.error("Evaluar alertas:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "No se pudieron evaluar las alertas." }, { status: 500 })
  }
}

export const GET = manejar // Vercel Cron llama con GET
export const POST = manejar
