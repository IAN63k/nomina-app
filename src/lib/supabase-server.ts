import { createClient } from "@supabase/supabase-js"

/**
 * A qué base de datos va una consulta del servidor. Se pasa siempre el
 * usuario de la sesión: si es de demostración (`demo: true`) se usa el
 * proyecto Supabase demo, que solo tiene datos ficticios.
 *
 * Para lo que no tiene usuario (login con `verificar_login`, Vercel Cron) se
 * pasa `BD_REAL` de forma explícita: el parámetro es obligatorio para que
 * ninguna ruta pueda caer en la base real por olvido.
 */
export interface DestinoBd {
  demo?: boolean
}

export const BD_REAL: DestinoBd = Object.freeze({ demo: false })

/**
 * Cliente Supabase para uso exclusivo en el servidor (API routes, Server Actions).
 * Usa SERVICE_ROLE_KEY — nunca exponer al browser.
 */
export function getSupabaseServerClient(destino: DestinoBd) {
  const { url, key } = destino.demo ? credencialesDemo() : credencialesReales()
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

function credencialesReales() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (server)")
  }
  return { url, key }
}

/**
 * Credenciales del proyecto demo. Si faltan o apuntan al proyecto real se lanza
 * un error: una sesión demo nunca debe terminar leyendo datos reales.
 */
function credencialesDemo() {
  const url = process.env.DEMO_SUPABASE_URL
  const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Faltan DEMO_SUPABASE_URL / DEMO_SUPABASE_SERVICE_ROLE_KEY para el modo demo")
  }
  const normaliza = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase()
  const real = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (real && normaliza(real) === normaliza(url)) {
    throw new Error("DEMO_SUPABASE_URL apunta al proyecto real: el modo demo queda bloqueado")
  }
  if (key === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("DEMO_SUPABASE_SERVICE_ROLE_KEY es la llave del proyecto real: el modo demo queda bloqueado")
  }
  return { url, key }
}
