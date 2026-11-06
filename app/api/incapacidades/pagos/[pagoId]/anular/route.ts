import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { auditar, cobroDeIncapacidad, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { proponerEstadoTrasPago } from "@/src/services/incapacidadesEngine"
import { validarMotivo } from "@/src/services/incapacidadesValidacion"

/**
 * Anula un pago (solo administrador, con motivo). Nunca se borra: queda con
 * quién, cuándo y por qué. Para corregir un pago se anula y se registra otro.
 */
export const POST = ruta<{ pagoId: string }>("anular_pago", async ({ req, db, user }, { pagoId }) => {
  exigirUuid(pagoId, "Pago")
  const motivo = exigir(validarMotivo(await leerJson(req), "El motivo de la anulación"))

  const pago = sinError(await db.from("incapacidad_pagos").select("*").eq("id", pagoId).maybeSingle())
  if (!pago) throw new ErrorHttp(404, "Pago no encontrado")
  if (pago.anulado) throw new ErrorHttp(409, "El pago ya estaba anulado")

  const ahora = new Date().toISOString()
  sinError(await db.from("incapacidad_pagos")
    .update({ anulado: true, motivo_anulacion: motivo, anulado_por: user.usuario, anulado_at: ahora })
    .eq("id", pagoId).eq("anulado", false))
  await auditar(db, [{
    tabla: "incapacidad_pagos", registro_id: pagoId, accion: "anular", campo: "anulado",
    valor_anterior: { valor: Number(pago.valor), fecha_pago: pago.fecha_pago }, valor_nuevo: { motivo }, usuario: user.usuario,
  }])

  const inc = (await obtenerIncapacidad(db, pago.incapacidad_id))!
  const { params, cobro } = await cobroDeIncapacidad(db, inc)
  return NextResponse.json({
    cobro,
    // Tras anular puede que el estado ya no corresponda (p. ej. "Pagada" sin pagos).
    propuesta: cobro.pagado > 0 ? proponerEstadoTrasPago(cobro.valor, cobro.pagado, params) : { estado: "En trámite", aviso: null },
    estadoActual: inc.estado,
  })
})
