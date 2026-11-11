import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireSession } from "@/src/lib/requireSession"
import { getSupabaseServerClient } from "@/src/lib/supabase-server"
import type { Accion } from "@/src/lib/permisos"
import type { SessionUser } from "@/src/lib/session"

/** Utilidades comunes de app/api/incapacidades/* (y colaboradores). Solo servidor. */

export class ErrorHttp extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message)
  }
}

export const fallo = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status })

export async function leerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErrorHttp(400, "Cuerpo inválido")
  }
}

export interface Contexto {
  req: NextRequest
  user: SessionUser
  db: SupabaseClient
}

/**
 * Envuelve una ruta: valida sesión + permiso, entrega el cliente de BD y
 * convierte errores en respuestas (ErrorHttp → su estado; otros → 500 con log,
 * sin filtrar detalles internos al navegador).
 */
export function ruta<P = Record<string, string>>(
  accion: Accion,
  manejador: (ctx: Contexto, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, segmento: { params: Promise<P> }): Promise<Response> => {
    const auth = await requireSession(req, accion)
    if (!auth.ok) return auth.response
    try {
      const params = segmento?.params ? await segmento.params : ({} as P)
      return await manejador({ req, user: auth.user, db: getSupabaseServerClient(auth.user) }, params)
    } catch (e) {
      if (e instanceof ErrorHttp) return fallo(e.status, e.message, e.extra)
      console.error(`${req.method} ${req.nextUrl.pathname}:`, e instanceof Error ? e.message : e)
      return fallo(500, "Error interno. Intente de nuevo o avise a sistemas.")
    }
  }
}

/** Lanza 400 si la validación falló; si no, devuelve el valor. */
export function exigir<T>(r: { ok: true; valor: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new ErrorHttp(400, r.error)
  return r.valor
}

export function exigirUuid(id: string, que = "Identificador"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ErrorHttp(400, `${que} inválido`)
  return id
}

export function sinError<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
