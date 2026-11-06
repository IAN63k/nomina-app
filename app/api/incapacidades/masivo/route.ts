import { NextResponse } from "next/server"
import { ErrorHttp, exigir, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { aIncapacidad, COLUMNAS_INCAPACIDAD, leerParametros, type FilaIncapacidad } from "@/src/lib/incapacidadesDb"
import { aplicarEdicion } from "@/src/lib/incapacidadesEdicion"
import { hoyBogota } from "@/src/services/incapacidadesEngine"
import { validarEdicion, validarMasivo } from "@/src/services/incapacidadesValidacion"

/**
 * Registro masivo: el mismo cambio (estado, causal, radicación EPS o
 * responsable) a varias incapacidades. Se valida TODO antes de escribir: si
 * una no cumple (p. ej. Rechazada sin causal), no se cambia ninguna.
 */
export const PATCH = ruta("editar_seguimiento", async ({ req, db, user }) => {
  const { ids, cambios } = exigir(validarMasivo(await leerJson(req)))
  const params = await leerParametros(db)
  const hoy = hoyBogota()

  const filas = sinError(await db.from("incapacidades").select(COLUMNAS_INCAPACIDAD).in("id", ids).is("deleted_at", null))
  const incs = (filas as FilaIncapacidad[]).map(aIncapacidad)
  if (incs.length !== ids.length) throw new ErrorHttp(404, "Alguna incapacidad seleccionada no existe")

  const errores = incs.flatMap((inc) => {
    const r = validarEdicion(cambios, inc, params, hoy)
    return r.ok ? [] : [{ id: inc.id, nroIncapacidad: inc.nroIncapacidad, error: r.error }]
  })
  if (errores.length) {
    throw new ErrorHttp(400, `${errores.length} incapacidad(es) no admiten el cambio; no se cambió ninguna`, { errores })
  }

  for (const inc of incs) await aplicarEdicion(db, inc, cambios, user.usuario, { params, evaluar: false })
  return NextResponse.json({ actualizadas: incs.length })
})
