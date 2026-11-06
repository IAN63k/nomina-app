import { NextResponse } from "next/server"
import { ruta } from "@/src/lib/apiIncapacidades"
import {
  fondosPorIdentificacion,
  leerParametros,
  listarGestiones,
  listarIncapacidades,
  listarPagos,
  listarPqrd,
} from "@/src/lib/incapacidadesDb"
import { fechaCorteEfectiva } from "@/src/services/incapacidadesEngine"

/**
 * Datos de Seguimiento: incapacidades + pagos vigentes + PQRD + fondos +
 * parámetros. Los cálculos (saldo, alerta, vistas, Resumen) los hace el
 * navegador con incapacidadesEngine.ts, la misma fuente de verdad del servidor.
 */
export const GET = ruta("ver", async ({ db }) => {
  const [params, incapacidades, pagos, pqrd, fondos, gestiones] = await Promise.all([
    leerParametros(db),
    listarIncapacidades(db),
    listarPagos(db),
    listarPqrd(db),
    fondosPorIdentificacion(db),
    listarGestiones(db),
  ])

  // Por incapacidad solo hace falta la última gestión (la tabla muestra su fecha).
  const ultimaGestion: Record<string, string> = {}
  for (const g of gestiones) {
    if (!ultimaGestion[g.incapacidadId] || g.fecha > ultimaGestion[g.incapacidadId]) ultimaGestion[g.incapacidadId] = g.fecha
  }
  const ids = new Set(incapacidades.map((i) => i.identificacion))

  return NextResponse.json({
    params,
    corte: fechaCorteEfectiva(params),
    incapacidades,
    pagos: pagos.filter((p) => !p.anulado),
    pqrd,
    fondos: Object.fromEntries([...fondos].filter(([id]) => ids.has(id))),
    ultimaGestion,
  })
})
