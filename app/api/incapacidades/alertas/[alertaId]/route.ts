import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { auditar } from "@/src/lib/incapacidadesDb"
import { validarAtencion } from "@/src/services/incapacidadesValidacion"

/** Marca una alerta como Atendida: quién, cuándo y una nota corta. Queda en el historial. */
export const PATCH = ruta<{ alertaId: string }>("atender_alerta", async ({ req, db, user }, { alertaId }) => {
  exigirUuid(alertaId, "Alerta")
  const nota = exigir(validarAtencion(await leerJson(req)))
  const actual = sinError(await db.from("incapacidad_alertas").select("estado").eq("id", alertaId).maybeSingle())
  if (!actual) throw new ErrorHttp(404, "Alerta no encontrada")
  if (actual.estado === "Atendida") throw new ErrorHttp(409, "La alerta ya estaba atendida")

  const fila = sinError(await db.from("incapacidad_alertas")
    .update({ estado: "Atendida", atendida_por: user.usuario, atendida_at: new Date().toISOString(), nota })
    .eq("id", alertaId).eq("estado", "Pendiente").select("*").single())
  await auditar(db, [{
    tabla: "incapacidad_alertas", registro_id: alertaId, accion: "atender", campo: "estado",
    valor_anterior: "Pendiente", valor_nuevo: { estado: "Atendida", nota }, usuario: user.usuario,
  }])
  return NextResponse.json(fila)
})
