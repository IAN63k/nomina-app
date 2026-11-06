/**
 * Cliente de las rutas propias (app/api/*) para el navegador.
 *
 * Reemplaza al cliente de Supabase con la llave anónima: el navegador ya no
 * habla directo con la base de datos. Si una ruta responde 401 (sesión
 * vencida o de una versión anterior), se avisa a toda la app con el evento
 * EVENTO_SESION_VENCIDA para que pida iniciar sesión de nuevo, en vez de
 * fallar en silencio (p. ej. un TXT con cédulas 0000000000).
 */

export const EVENTO_SESION_VENCIDA = "nomina:sesion-vencida"

export class ErrorApiCliente extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiJson<T>(
  url: string,
  opciones: { method?: string; body?: unknown; avisarSesion?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, avisarSesion = true } = opciones
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // sin cuerpo JSON
  }
  if (!res.ok) {
    if (res.status === 401 && avisarSesion && typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA))
    }
    const msg = (data as { error?: unknown } | null)?.error
    throw new ErrorApiCliente(res.status, typeof msg === "string" ? msg : `Error ${res.status}`)
  }
  return data as T
}
