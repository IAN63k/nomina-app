import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { aPqrd, auditar, leerParametros, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { fechaLimitePqrd, hoyBogota } from "@/src/services/incapacidadesEngine"
import { validarPqrdNueva } from "@/src/services/incapacidadesValidacion"

/**
 * Monta una PQRD sobre la incapacidad. La fecha límite se calcula: radicación
 * + N días hábiles (sin fines de semana ni festivos). Si la entidad no viene,
 * se toma la EPS de la incapacidad.
 */
export const POST = ruta<{ id: string }>("registrar_gestion", async ({ req, db, user }, { id }) => {
  exigirUuid(id)
  const inc = await obtenerIncapacidad(db, id)
  if (!inc) throw new ErrorHttp(404, "Incapacidad no encontrada")
  const params = await leerParametros(db)
  const body = (await leerJson(req)) as Record<string, unknown>
  const p = exigir(validarPqrdNueva({ entidad: inc.eps, ...body }, params, hoyBogota()))

  const fila = sinError(await db.from("incapacidad_pqrd").insert({
    incapacidad_id: id,
    radicado: p.radicado,
    entidad: p.entidad,
    fecha_radicacion: p.fechaRadicacion,
    motivo: p.motivo,
    fecha_limite: fechaLimitePqrd(p.fechaRadicacion, params),
    created_by: user.usuario,
  }).select("*").single())

  sinError(await db.from("incapacidad_gestiones").insert({
    incapacidad_id: id, fecha: p.fechaRadicacion, tipo: "Reclamación",
    accion: `PQRD ${p.radicado} radicada ante ${p.entidad}: ${p.motivo}`, created_by: user.usuario,
  }))
  await auditar(db, [{ tabla: "incapacidad_pqrd", registro_id: fila.id, accion: "insert", valor_nuevo: p, usuario: user.usuario }])
  return NextResponse.json(aPqrd(fila), { status: 201 })
})
