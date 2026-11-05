import { NextResponse } from "next/server"
import { ErrorHttp, exigir, leerJson, ruta, sinError } from "@/src/lib/apiIncapacidades"
import {
  asignarFondo,
  evaluarAlertas,
  filaParaImportar,
  fondosPorIdentificacion,
  leerParametros,
  llavesRegistradas,
} from "@/src/lib/incapacidadesDb"
import { llaveIncapacidad } from "@/src/services/incapacidadesEngine"
import { prepararCarga } from "@/src/services/incapacidadesParser"
import { validarCarga } from "@/src/services/incapacidadesValidacion"

/**
 * RF-01: carga del reporte KactuS.
 *
 * El navegador lee el .xlsx (el diagnóstico se usa allí y se descarta) y envía
 * las filas. El servidor decide nuevas / duplicadas / para revisar contra la
 * BD (no confía en el cálculo del navegador):
 *   - modo "vista_previa": devuelve el resultado sin guardar nada.
 *   - modo "confirmar": exige EPS y fondo asignados donde falten, guarda las
 *     nuevas en una sola transacción, registra la carga y evalúa alertas.
 * La carga nunca modifica lo ya registrado.
 */
export const POST = ruta("cargar_archivo", async ({ req, db, user }) => {
  const body = (await leerJson(req)) as Record<string, unknown>
  const modo = body?.modo
  if (modo !== "vista_previa" && modo !== "confirmar") throw new ErrorHttp(400, "modo debe ser 'vista_previa' o 'confirmar'")

  const params = await leerParametros(db)
  const entrada = exigir(validarCarga(body, params))
  const filas = entrada.filas.map((f) =>
    f.eps || !entrada.epsAsignadas[String(f.fila)] ? f : { ...f, eps: entrada.epsAsignadas[String(f.fila)] },
  )

  const [registradas, fondos] = await Promise.all([llavesRegistradas(db), fondosPorIdentificacion(db)])
  for (const [ident, fondo] of Object.entries(entrada.fondosAsignados)) fondos.set(ident, fondo)

  const vista = prepararCarga(
    { filas, rechazadas: entrada.rechazadas },
    registradas.map((r) => ({
      identificacion: r.identificacion, nroIncapacidad: r.nro_incapacidad, fechaRadicacionNomina: r.fecha_radicacion_nomina,
    })),
    fondos,
    entrada.archivo,
  )
  const resumen = {
    nuevas: vista.nuevas.length,
    duplicadas: vista.duplicadas.length,
    rechazadas: vista.rechazadas.length,
    paraRevisar: vista.paraRevisar.length,
  }

  if (modo === "vista_previa") {
    return NextResponse.json({ ...vista, resumen, puedeGuardar: !vista.sinEps.length && !vista.sinFondo.length })
  }

  if (vista.sinEps.length || vista.sinFondo.length) {
    throw new ErrorHttp(409, "Antes de guardar asigne la EPS y el fondo de pensiones que faltan", {
      sinEps: vista.sinEps, sinFondo: vista.sinFondo,
    })
  }
  // Aunque no haya nuevas, la carga se registra: deja constancia de que el archivo se procesó.
  // Fondos digitados en la carga → maestro de colaboradores.
  const nombres = new Map(filas.map((f) => [f.identificacion, f.nombre]))
  for (const [ident, fondo] of Object.entries(entrada.fondosAsignados)) {
    await asignarFondo(db, ident, nombres.get(ident) ?? ident, fondo, user.usuario)
  }

  const entidad = new Map(filas.map((f) => [llaveIncapacidad(f.identificacion, f.nroIncapacidad), f.entidadKactus || null]))
  const resultado = sinError(await db.rpc("incapacidades_importar", {
    p_carga: {
      archivo: entrada.archivo,
      tipo: "kactus",
      usuario: user.usuario,
      duplicadas: resumen.duplicadas,
      rechazadas: resumen.rechazadas,
      para_revisar: resumen.paraRevisar,
      detalle: {
        rechazadas: vista.rechazadas,
        paraRevisar: vista.paraRevisar,
        duplicadas: vista.duplicadas.map((d) => ({ fila: d.fila, nroIncapacidad: d.nroIncapacidad, contra: d.contra })),
        epsAsignadas: entrada.epsAsignadas,
        fondosAsignados: entrada.fondosAsignados,
      },
    },
    p_incapacidades: vista.nuevas.map((n) => filaParaImportar(n, entidad.get(llaveIncapacidad(n.identificacion, n.nroIncapacidad)) ?? null)),
  })) as { carga_id: string; nuevas: number }

  const alertas = await evaluarAlertas(db)
  return NextResponse.json({ ...resumen, nuevas: resultado.nuevas, cargaId: resultado.carga_id, alertasNuevas: alertas.nuevas }, { status: 201 })
})

/** Historial de cargas (RF-01, paso 6). */
export const GET = ruta("ver", async ({ db }) => {
  const cargas = sinError(await db.from("incapacidad_cargas")
    .select("id, archivo, tipo, usuario, nuevas, duplicadas, rechazadas, para_revisar, created_at")
    .order("created_at", { ascending: false }).limit(100))
  return NextResponse.json({ cargas })
})
