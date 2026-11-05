/** Cliente de app/api/incapacidades/* para el navegador. */

export class ErrorApi extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

type Opciones = { method?: string; body?: unknown; form?: FormData }

/** Avisa a la página cuando la sesión firmada venció (401). */
let alVencerSesion: (() => void) | null = null
export const onSesionVencida = (fn: (() => void) | null) => {
  alVencerSesion = fn
}

export async function pedir<T = unknown>(url: string, { method = "GET", body, form }: Opciones = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // respuesta sin cuerpo JSON
  }
  if (!res.ok) {
    if (res.status === 401) alVencerSesion?.()
    const d = (data ?? {}) as Record<string, unknown>
    throw new ErrorApi(res.status, typeof d.error === "string" ? d.error : `Error ${res.status}`, d)
  }
  return data as T
}

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error inesperado.")
