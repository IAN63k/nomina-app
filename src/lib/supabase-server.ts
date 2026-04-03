import { createClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase para uso exclusivo en el servidor (API routes, Server Actions).
 * Usa SERVICE_ROLE_KEY — nunca exponer al browser.
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (server)")
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
