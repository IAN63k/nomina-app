import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { aPqrd, auditar, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { aplicarEdicion } from "@/src/lib/incapacidadesEdicion"
import { hoyBogota } from "@/src/services/incapacidadesEngine"
import { validarRespuestaPqrd } from "@/src/services/incapacidadesValidacion"
import { ESTADO } from "@/src/types/incapacidad"

/**
 * Registra la respuesta de la PQRD. A favor: la incapacidad rechazada vuelve a
 * "En trámite" (se espera el pago). En contra: queda igual; el usuario puede
 * pasarla a "Castigada" con motivo.
 */
export const PATCH = ruta<{ pqrdId: string }>("registrar_gestion", async ({ req, db, user }, { pqrdId }) => {
  exigirUuid(pqrdId, "PQRD")
  const r = exigir(validarRespuestaPqrd(await leerJson(req), hoyBogota()))
  const actual = sinError(await db.from("incapacidad_pqrd").select("*").eq("id", pqrdId).maybeSingle())
  if (!actual) throw new ErrorHttp(404, "PQRD no encontrada")

  const fila = sinError(await db.from("incapacidad_pqrd").update({
    estado: r.estado,
    fecha_respuesta: r.fechaRespuesta,
    resumen_respuesta: r.resumenRespuesta,
    updated_by: user.usuario,
    updated_at: new Date().toISOString(),
  }).eq("id", pqrdId).select("*").single())

  await auditar(db, [{
    tabla: "incapacidad_pqrd", registro_id: pqrdId, accion: "update", campo: "estado",
    valor_anterior: actual.estado, valor_nuevo: r, usuario: user.usuario,
  }])

  let incapacidad = null
  if (r.estado !== actual.estado && r.estado !== "Abierta") {
    sinError(await db.from("incapacidad_gestiones").insert({
      incapacidad_id: actual.incapacidad_id, fecha: r.fechaRespuesta, tipo: "Reclamación",
      accion: `PQRD ${actual.radicado} ${r.estado.toLowerCase()}: ${r.resumenRespuesta}`, created_by: user.usuario,
    }))
    const inc = await obtenerIncapacidad(db, actual.incapacidad_id)
    if (r.estado === "Respondida a favor" && inc && inc.estado === ESTADO.rechazada) {
      incapacidad = (await aplicarEdicion(db, inc, { estado: ESTADO.enTramite }, user.usuario)).incapacidad
    }
  }
  return NextResponse.json({ pqrd: aPqrd(fila), incapacidad })
})
