import { NextResponse } from "next/server"
import { ErrorHttp, exigir, exigirUuid, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { aPago, auditar, cobroDeIncapacidad, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { hoyBogota, proponerEstadoTrasPago } from "@/src/services/incapacidadesEngine"
import { validarPago } from "@/src/services/incapacidadesValidacion"

/**
 * RF-03: registra un pago de la EPS (o del fondo). Devuelve el cobro
 * recalculado y el estado que la app PROPONE; el usuario lo confirma o lo
 * cambia con PATCH /api/incapacidades/[id].
 */
export const POST = ruta<{ id: string }>("registrar_pago", async ({ req, db, user }, { id }) => {
  exigirUuid(id)
  const inc = await obtenerIncapacidad(db, id)
  if (!inc) throw new ErrorHttp(404, "Incapacidad no encontrada")
  const pago = exigir(validarPago(await leerJson(req), hoyBogota()))

  const fila = sinError(await db.from("incapacidad_pagos").insert({
    incapacidad_id: id,
    tramo: pago.tramo,
    fecha_pago: pago.fechaPago,
    valor: pago.valor,
    observacion: pago.observacion,
    created_by: user.usuario,
  }).select("*").single())

  await auditar(db, [{ tabla: "incapacidad_pagos", registro_id: fila.id, accion: "insert", valor_nuevo: pago, usuario: user.usuario }])

  const { params, cobro } = await cobroDeIncapacidad(db, inc)
  return NextResponse.json({
    pago: aPago(fila),
    cobro,
    propuesta: proponerEstadoTrasPago(cobro.valor, cobro.pagado, params),
    estadoActual: inc.estado,
  }, { status: 201 })
})
