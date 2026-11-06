import { NextResponse } from "next/server"
import { exigir, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { auditar } from "@/src/lib/incapacidadesDb"
import { exigirModulo } from "@/src/lib/turnosDb"
import { validarCodigoCatalogo, validarTurnoCatalogo } from "@/src/services/turnosValidacion"

type P = { modulo: string }

/** Turnos personalizados del módulo (compartidos por todos los usuarios). */
export const GET = ruta<P>("ver_turnos", async ({ db }, { modulo }) => {
  const m = exigirModulo(modulo)
  const filas = sinError(await db.from("turnos_catalogo").select("codigo, entrada, salida, total, descripcion").eq("modulo", m)) ?? []
  return NextResponse.json(Object.fromEntries(filas.map((r) => [r.codigo, {
    entrada: r.entrada ?? "", salida: r.salida ?? "", total: r.total ?? "0", descripcion: r.descripcion ?? "",
  }])))
})

/** Crea o actualiza un turno personalizado. */
export const PUT = ruta<P>("editar_turnos", async ({ req, db, user }, { modulo }) => {
  const m = exigirModulo(modulo)
  const { codigo, config } = exigir(validarTurnoCatalogo(await leerJson(req)))
  sinError(await db.from("turnos_catalogo").upsert(
    { modulo: m, codigo, ...config, updated_at: new Date().toISOString() },
    { onConflict: "modulo,codigo" },
  ))
  await auditar(db, [{ tabla: "turnos_catalogo", registro_id: `${m}:${codigo}`, accion: "upsert", valor_nuevo: config, usuario: user.usuario }])
  return NextResponse.json({ ok: true })
})

/** Borra un turno personalizado (?codigo=X) o todos los del módulo (sin código: "Restaurar valores por defecto"). */
export const DELETE = ruta<P>("editar_turnos", async ({ req, db, user }, { modulo }) => {
  const m = exigirModulo(modulo)
  const codigoParam = req.nextUrl.searchParams.get("codigo")
  let q = db.from("turnos_catalogo").delete().eq("modulo", m)
  if (codigoParam !== null) q = q.eq("codigo", exigir(validarCodigoCatalogo(codigoParam)))
  sinError(await q)
  await auditar(db, [{ tabla: "turnos_catalogo", registro_id: `${m}:${codigoParam ?? "*"}`, accion: "delete", usuario: user.usuario }])
  return NextResponse.json({ ok: true })
})
