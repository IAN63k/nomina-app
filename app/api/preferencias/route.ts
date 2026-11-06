import { NextResponse } from "next/server"
import { ErrorHttp, exigir, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { CLAVE_PREFERENCIA, validarPreferencia } from "@/src/services/turnosValidacion"

/**
 * Preferencias del usuario de la SESIÓN (no del que diga el navegador): nadie
 * puede leer ni cambiar las preferencias de otro.
 */
export const GET = ruta("ver", async ({ req, db, user }) => {
  const clave = req.nextUrl.searchParams.get("clave") ?? ""
  if (!CLAVE_PREFERENCIA.test(clave)) throw new ErrorHttp(400, "Clave de preferencia no permitida")
  const fila = sinError(await db.from("user_preferences").select("valor").eq("usuario", user.usuario).eq("clave", clave).maybeSingle())
  return NextResponse.json({ valor: fila?.valor ?? null })
})

export const PUT = ruta("ver", async ({ req, db, user }) => {
  const { clave, valor } = exigir(validarPreferencia(await leerJson(req)))
  sinError(await db.from("user_preferences").upsert(
    { usuario: user.usuario, clave, valor, updated_at: new Date().toISOString() },
    { onConflict: "usuario,clave" },
  ))
  return NextResponse.json({ ok: true })
})
