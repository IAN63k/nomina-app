import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { auditar, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { hoyBogota } from "@/src/services/incapacidadesEngine"
import { validarGestion } from "@/src/services/incapacidadesValidacion"

/** RF-04: registra una gestión (llamada, correo, reclamación…). Historial: nunca se sobrescribe. */
export const POST = ruta<{ id: string }>("registrar_gestion", async ({ req, db, user }, { id }) => {
  exigirUuid(id)
  if (!(await obtenerIncapacidad(db, id))) throw new ErrorHttp(404, "Incapacidad no encontrada")
  const g = exigir(validarGestion(await leerJson(req), hoyBogota()))
  const fila = sinError(await db.from("incapacidad_gestiones").insert({
    incapacidad_id: id, fecha: g.fecha, tipo: g.tipo, accion: g.accion,
    responsable: g.responsable ?? user.nombre, created_by: user.usuario,
  }).select("*").single())
  await auditar(db, [{ tabla: "incapacidad_gestiones", registro_id: fila.id, accion: "insert", valor_nuevo: g, usuario: user.usuario }])
  return NextResponse.json(fila, { status: 201 })
})
