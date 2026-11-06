import { NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/src/lib/session"

/** Indica si la cookie de sesión firmada sigue vigente (la UI la usa para pedir re-login). */
export async function GET(req: NextRequest) {
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!user) return NextResponse.json({ error: "Sesión no válida o vencida." }, { status: 401 })
  return NextResponse.json(user)
}
