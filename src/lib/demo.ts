import { timingSafeEqual } from "node:crypto"
import type { SessionUser } from "@/src/lib/session"

/**
 * Usuario de demostración (solo servidor). Se define por variables de entorno,
 * no en la tabla `usuarios`, para que entrar como demo nunca consulte la base
 * real. Su sesión lleva `demo: true` y todas las rutas usan el proyecto
 * Supabase demo (ver `getSupabaseServerClient`).
 *
 *   DEMO_USUARIO, DEMO_PASSWORD (≥ 8 caracteres),
 *   DEMO_SUPABASE_URL, DEMO_SUPABASE_SERVICE_ROLE_KEY
 *
 * Si falta cualquiera, el modo demo queda apagado.
 */

export const USUARIO_DEMO_ID = "00000000-0000-0000-0000-00000000de00"

export function demoHabilitado(): boolean {
  const e = process.env
  return Boolean(
    e.DEMO_USUARIO?.trim() && (e.DEMO_PASSWORD?.length ?? 0) >= 8 &&
    e.DEMO_SUPABASE_URL && e.DEMO_SUPABASE_SERVICE_ROLE_KEY,
  )
}

/** ¿El nombre de usuario escrito es el de la demo? (sin distinguir mayúsculas) */
export function esUsuarioDemo(usuario: string): boolean {
  if (!demoHabilitado()) return false
  return usuario.trim().toLowerCase() === process.env.DEMO_USUARIO!.trim().toLowerCase()
}

function igualSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Devuelve el usuario demo si usuario y contraseña coinciden; si no, null. */
export function loginDemo(usuario: string, password: string): SessionUser | null {
  if (!esUsuarioDemo(usuario) || !igualSeguro(password, process.env.DEMO_PASSWORD!)) return null
  return {
    id: USUARIO_DEMO_ID,
    nombre: "Usuario de demostración",
    usuario: process.env.DEMO_USUARIO!.trim(),
    rol: "admin",
    demo: true,
  }
}
