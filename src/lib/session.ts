import { SignJWT, jwtVerify } from "jose"

/**
 * Sesión firmada (JWT HS256) en cookie httpOnly.
 *
 * El login sigue guardando el usuario en localStorage para la UI, pero las
 * rutas del servidor que manejan datos sensibles (incapacidades) no pueden
 * confiar en eso: validan esta cookie, que el navegador no puede leer ni
 * falsificar sin SESSION_SECRET.
 */

export const SESSION_COOKIE = "nomina_session"
export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 h

export interface SessionUser {
  id: string
  nombre: string
  usuario: string
  rol: string
  /** Sesión de demostración: todas las rutas usan la BD demo (datos ficticios). */
  demo?: boolean
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET no está configurado (mínimo 32 caracteres)")
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const claims: Record<string, unknown> = { nombre: user.nombre, usuario: user.usuario, rol: user.rol }
  if (user.demo) claims.demo = true
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret())
}

/** Devuelve el usuario si el token es válido y no ha vencido; si no, null. */
export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] })
    if (!payload.sub || typeof payload.usuario !== "string") return null
    const user: SessionUser = {
      id: payload.sub,
      nombre: String(payload.nombre ?? ""),
      usuario: payload.usuario,
      rol: String(payload.rol ?? ""),
    }
    if (payload.demo === true) user.demo = true
    return user
  } catch {
    return null
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  }
}
