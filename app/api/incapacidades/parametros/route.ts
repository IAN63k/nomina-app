import { NextResponse } from "next/server"
import { exigir, leerJson, ruta } from "@/src/lib/apiIncapacidades"
import { evaluarAlertas, guardarParametros, leerParametros } from "@/src/lib/incapacidadesDb"
import { validarParametros } from "@/src/services/incapacidadesValidacion"

/** RF-10: parámetros y listas del módulo. */
export const GET = ruta("ver", async ({ db }) => NextResponse.json(await leerParametros(db)))

/** Solo el administrador. Si cambian hitos, previa o fecha de corte, se reevalúan las alertas. */
export const PUT = ruta("editar_parametros", async ({ req, db, user }) => {
  const cambios = exigir(validarParametros(await leerJson(req)))
  await guardarParametros(db, cambios, user.usuario)
  const afectaAlertas = ["hitosDias", "diasAlertaPrevia", "fechaCorte", "diasHabilesPqrd"].some((k) => k in cambios)
  const alertas = afectaAlertas ? await evaluarAlertas(db) : null
  return NextResponse.json({ parametros: await leerParametros(db), alertasNuevas: alertas?.nuevas ?? 0 })
})
