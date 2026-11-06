import { NextResponse } from "next/server"
import { ErrorHttp, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { asignarFondo, leerParametros } from "@/src/lib/incapacidadesDb"
import { IDENTIFICACION_VALIDA } from "@/src/types/colaborador"

/**
 * Registra el fondo de pensiones de un colaborador desde Incapacidades (al
 * llegar a 180 días). Vive en el maestro de colaboradores; si el colaborador
 * no está en el maestro, se crea con el nombre de su incapacidad.
 */
export const PUT = ruta<{ identificacion: string }>("editar_seguimiento", async ({ req, db, user }, { identificacion }) => {
  if (!IDENTIFICACION_VALIDA.test(identificacion)) throw new ErrorHttp(400, "Identificación inválida")
  const body = (await leerJson(req)) as Record<string, unknown>
  const params = await leerParametros(db)
  if (typeof body?.fondo !== "string" || !params.listaFondos.includes(body.fondo)) {
    throw new ErrorHttp(400, `Fondo no válido. Opciones: ${params.listaFondos.join(", ")}`)
  }
  const inc = sinError(await db.from("incapacidades").select("nombre").eq("identificacion", identificacion).limit(1))
  if (!inc?.length) throw new ErrorHttp(404, "No hay incapacidades de ese colaborador")
  await asignarFondo(db, identificacion, inc[0].nombre, body.fondo, user.usuario)
  return NextResponse.json({ identificacion, fondo: body.fondo })
})
