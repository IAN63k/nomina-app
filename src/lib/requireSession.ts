import { NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/src/lib/session"
import { puede, type Accion } from "@/src/lib/permisos"

type Resultado =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse }

/**
 * Guardia para las rutas con datos personales (app/api/incapacidades/*,
 * app/api/colaboradores/*): exige sesión firmada válida
 * y que el rol tenga permiso para la acción.
 *
 *   const auth = await requireSession(req, "registrar_pago")
 *   if (!auth.ok) return auth.response
 */
export async function requireSession(req: NextRequest, accion: Accion): Promise<Resultado> {
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sesión no válida o vencida. Vuelva a iniciar sesión." },
        { status: 401 },
      ),
    }
  }
  if (!puede(user.rol, accion)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 }),
    }
  }
  return { ok: true, user }
}
