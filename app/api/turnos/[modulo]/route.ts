import { NextResponse } from "next/server"
import { ErrorHttp, exigir, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { COLUMNAS_TURNOS, PAGINA_TURNOS, TABLA_TURNOS, exigirModulo } from "@/src/lib/turnosDb"
import { validarFilasTurnos } from "@/src/services/turnosValidacion"

type P = { modulo: string }

/**
 * Turnos guardados de Recargos, por páginas de 1000 filas (?desde=0). El
 * navegador pide páginas hasta que `siguiente` sea null.
 */
export const GET = ruta<P>("ver_turnos", async ({ req, db }, { modulo }) => {
  const m = exigirModulo(modulo)
  const desde = Number(req.nextUrl.searchParams.get("desde") ?? "0")
  if (!Number.isInteger(desde) || desde < 0) throw new ErrorHttp(400, "Parámetro 'desde' inválido")
  const filas = sinError(await db.from(TABLA_TURNOS[m]).select(COLUMNAS_TURNOS[m])
    .order("fecha", { ascending: true }).order("medico", { ascending: true }).order("concepto", { ascending: true })
    .range(desde, desde + PAGINA_TURNOS - 1)) ?? []
  return NextResponse.json({ filas, siguiente: filas.length === PAGINA_TURNOS ? desde + PAGINA_TURNOS : null })
})

/** Guarda (upsert) un lote de filas calculadas por el motor de recargos. */
export const POST = ruta<P>("editar_turnos", async ({ req, db }, { modulo }) => {
  const m = exigirModulo(modulo)
  const filas = exigir(validarFilasTurnos(await leerJson(req), m))
  sinError(await db.from(TABLA_TURNOS[m]).upsert(filas, { onConflict: "medico,fecha_inicio,concepto" }))
  return NextResponse.json({ guardadas: filas.length })
})
