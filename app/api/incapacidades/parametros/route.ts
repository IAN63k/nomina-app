import { NextResponse } from "next/server"
import { exigir, leerJson, ruta } from "@/src/lib/apiIncapacidades"
import { evaluarYRegistrar, guardarParametros, leerParametros } from "@/src/lib/incapacidadesDb"
import { validarParametros } from "@/src/services/incapacidadesValidacion"

/** RF-10: parámetros y listas del módulo. */
export const GET = ruta("ver", async ({ db }) => NextResponse.json(await leerParametros(db)))

/** Solo el administrador. Si cambian hitos, previa o plazo de PQRD, se reevalúan las alertas. */
export const PUT = ruta("editar_parametros", async ({ req, db, user }) => {
  const cambios = exigir(validarParametros(await leerJson(req)))
  await guardarParametros(db, cambios, user.usuario)
  // La fecha de corte ya no afecta las alertas (se evalúan con la fecha de hoy).
  const afectaAlertas = ["hitosDias", "diasAlertaPrevia", "diasHabilesPqrd"].some((k) => k in cambios)
  const alertas = afectaAlertas ? await evaluarYRegistrar(db, "parametros", user.usuario) : null
  return NextResponse.json({ parametros: await leerParametros(db), alertasNuevas: alertas?.nuevas ?? 0 })
})
