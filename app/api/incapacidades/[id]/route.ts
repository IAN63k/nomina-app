import { NextResponse } from "next/server"
import { ErrorHttp, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { cobroDeIncapacidad, listarGestiones, listarPagos, listarPqrd, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { aplicarEdicion } from "@/src/lib/incapacidadesEdicion"

type Params = { id: string }

/** Ficha de una incapacidad: datos, cobro calculado e historiales (pagos, gestiones, PQRD, auditoría). */
export const GET = ruta<Params>("ver", async ({ db }, { id }) => {
  exigirUuid(id)
  const inc = await obtenerIncapacidad(db, id)
  if (!inc) throw new ErrorHttp(404, "Incapacidad no encontrada")
  const [{ cobro, corte }, pagos, gestiones, pqrd, auditoria] = await Promise.all([
    cobroDeIncapacidad(db, inc),
    listarPagos(db, id),
    listarGestiones(db, id),
    listarPqrd(db, id),
    db.from("incapacidad_auditoria").select("accion, campo, valor_anterior, valor_nuevo, usuario, created_at")
      .eq("tabla", "incapacidades").eq("registro_id", id).order("created_at", { ascending: false }).limit(200),
  ])
  return NextResponse.json({ incapacidad: inc, cobro, corte, pagos, gestiones, pqrd, auditoria: sinError(auditoria) })
})

export const PATCH = ruta<Params>("editar_seguimiento", async ({ req, db, user }, { id }) => {
  exigirUuid(id)
  const actual = await obtenerIncapacidad(db, id)
  if (!actual) throw new ErrorHttp(404, "Incapacidad no encontrada")
  return NextResponse.json(await aplicarEdicion(db, actual, await leerJson(req), user.usuario))
})
