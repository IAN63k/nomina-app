import type { SupabaseClient } from "@supabase/supabase-js"
import {
  alertasDiasAcumulados,
  calcularCobro,
  fechaCorteEfectiva,
  llaveIncapacidad,
  pqrdVencida,
} from "@/src/services/incapacidadesEngine"
import {
  PARAMETROS_POR_DEFECTO,
  type FechaISO,
  type Incapacidad,
  type Pago,
  type ParametrosIncapacidades,
  type Pqrd,
} from "@/src/types/incapacidad"

/**
 * Capa de BD del módulo de Incapacidades. SOLO servidor (service role): las
 * tablas no tienen políticas para anon. Mapea filas ↔ tipos de la app; las
 * reglas de negocio viven en incapacidadesEngine.ts.
 */

const PAGINA = 1000

/** Lee todas las filas paginando (PostgREST devuelve máximo 1000 por consulta). */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const salida: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    salida.push(...(data ?? []))
    if (!data || data.length < PAGINA) return salida
  }
}

// ─── Parámetros ───────────────────────────────────────────────────────────────

const CLAVE_PARAMETRO: Record<keyof ParametrosIncapacidades, string> = {
  fechaCorte: "fecha_corte",
  diasMora: "dias_mora",
  mesesPrescripcion: "meses_prescripcion",
  mesesAnticipacionPrescripcion: "meses_anticipacion_prescripcion",
  toleranciaRedondeo: "tolerancia_redondeo",
  diasHabilesPqrd: "dias_habiles_pqrd",
  hitosDias: "hitos_dias",
  diasAlertaPrevia: "dias_alerta_previa",
  diasMinimosSugerenciaTransito: "dias_minimos_sugerencia_transito",
  correosAlertas: "correos_alertas",
  listaEps: "lista_eps",
  listaFondos: "lista_fondos",
  listaEstados: "lista_estados",
  listaCausales: "lista_causales",
  listaTipos: "lista_tipos",
}

export async function leerParametros(db: SupabaseClient): Promise<ParametrosIncapacidades> {
  const { data, error } = await db.from("incapacidad_parametros").select("clave, valor")
  if (error) throw new Error(error.message)
  const porClave = new Map((data ?? []).map((r) => [r.clave as string, r.valor as unknown]))
  const params = { ...PARAMETROS_POR_DEFECTO } as Record<string, unknown>
  for (const [campo, clave] of Object.entries(CLAVE_PARAMETRO)) {
    if (porClave.has(clave)) params[campo] = porClave.get(clave)
  }
  return params as unknown as ParametrosIncapacidades
}

export async function guardarParametros(
  db: SupabaseClient,
  cambios: Partial<ParametrosIncapacidades>,
  usuario: string,
): Promise<void> {
  const anteriores = await leerParametros(db)
  const filas = Object.entries(cambios).map(([campo, valor]) => ({
    clave: CLAVE_PARAMETRO[campo as keyof ParametrosIncapacidades],
    valor,
    updated_by: usuario,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await db.from("incapacidad_parametros").upsert(filas, { onConflict: "clave" })
  if (error) throw new Error(error.message)
  await auditar(
    db,
    Object.entries(cambios).map(([campo, valor]) => ({
      tabla: "incapacidad_parametros",
      registro_id: CLAVE_PARAMETRO[campo as keyof ParametrosIncapacidades],
      accion: "update",
      campo,
      valor_anterior: anteriores[campo as keyof ParametrosIncapacidades] ?? null,
      valor_nuevo: valor,
      usuario,
    })),
  )
}

// ─── Incapacidades ────────────────────────────────────────────────────────────

export const COLUMNAS_INCAPACIDAD =
  "id, identificacion, nro_incapacidad, nombre, concepto, tipo, es_prorroga, dias, dias_acumulados, fecha_desde, fecha_hasta, fecha_radicacion_nomina, fecha_radicacion_eps, valor_incapacidad, eps, valor_fondo_manual, estado, causal_no_pago, responsable, observacion, fin_lactancia, sugerido_transito, para_revisar, origen"

export type FilaIncapacidad = {
  id: string
  identificacion: string
  nro_incapacidad: string
  nombre: string
  concepto: number | null
  tipo: string
  es_prorroga: boolean
  dias: number
  dias_acumulados: number
  fecha_desde: string
  fecha_hasta: string
  fecha_radicacion_nomina: string | null
  fecha_radicacion_eps: string | null
  valor_incapacidad: number | string
  eps: string | null
  valor_fondo_manual: number | string | null
  estado: string
  causal_no_pago: string | null
  responsable: string | null
  observacion: string | null
  fin_lactancia: string | null
  sugerido_transito: boolean
  para_revisar: string[] | null
  origen: string | null
}

export const aIncapacidad = (f: FilaIncapacidad): Incapacidad => ({
  id: f.id,
  identificacion: f.identificacion,
  nroIncapacidad: f.nro_incapacidad,
  nombre: f.nombre,
  concepto: f.concepto,
  tipo: f.tipo,
  esProrroga: f.es_prorroga,
  dias: f.dias,
  diasAcumulados: f.dias_acumulados,
  fechaDesde: f.fecha_desde,
  fechaHasta: f.fecha_hasta,
  fechaRadicacionNomina: f.fecha_radicacion_nomina,
  fechaRadicacionEps: f.fecha_radicacion_eps,
  valorIncapacidad: Number(f.valor_incapacidad),
  eps: f.eps,
  valorFondoManual: f.valor_fondo_manual === null ? null : Number(f.valor_fondo_manual),
  estado: f.estado,
  causalNoPago: f.causal_no_pago,
  responsable: f.responsable,
  observacion: f.observacion,
  finLactancia: f.fin_lactancia,
  sugeridoTransito: f.sugerido_transito,
  paraRevisar: f.para_revisar ?? [],
  origen: f.origen,
})

export async function listarIncapacidades(db: SupabaseClient): Promise<Incapacidad[]> {
  const filas = await todas<FilaIncapacidad>((d, h) =>
    db.from("incapacidades").select(COLUMNAS_INCAPACIDAD).is("deleted_at", null).order("fecha_hasta").order("id").range(d, h),
  )
  return filas.map(aIncapacidad)
}

export async function obtenerIncapacidad(db: SupabaseClient, id: string): Promise<Incapacidad | null> {
  const { data, error } = await db
    .from("incapacidades").select(COLUMNAS_INCAPACIDAD).eq("id", id).is("deleted_at", null).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? aIncapacidad(data as FilaIncapacidad) : null
}

/** Llaves ya registradas (incluye borradas lógicamente: nunca se vuelven a crear). */
export async function llavesRegistradas(db: SupabaseClient) {
  return todas<{ identificacion: string; nro_incapacidad: string; fecha_radicacion_nomina: string | null }>((d, h) =>
    db.from("incapacidades").select("identificacion, nro_incapacidad, fecha_radicacion_nomina").order("id").range(d, h),
  )
}

// ─── Pagos, PQRD, gestiones ───────────────────────────────────────────────────

type FilaPago = {
  id: string
  incapacidad_id: string
  tramo: "eps" | "fondo"
  fecha_pago: string
  valor: number | string
  observacion: string | null
  anulado: boolean
  motivo_anulacion?: string | null
  anulado_por?: string | null
  anulado_at?: string | null
  created_by?: string
  created_at?: string
}

export const aPago = (f: FilaPago): Pago & Record<string, unknown> => ({
  id: f.id,
  incapacidadId: f.incapacidad_id,
  tramo: f.tramo,
  fechaPago: f.fecha_pago,
  valor: Number(f.valor),
  observacion: f.observacion,
  anulado: f.anulado,
  motivoAnulacion: f.motivo_anulacion ?? null,
  anuladoPor: f.anulado_por ?? null,
  anuladoAt: f.anulado_at ?? null,
  creadoPor: f.created_by ?? null,
  creadoAt: f.created_at ?? null,
})

export async function listarPagos(db: SupabaseClient, incapacidadId?: string) {
  const filas = await todas<FilaPago>((d, h) => {
    let q = db.from("incapacidad_pagos").select("*").order("fecha_pago").order("id")
    if (incapacidadId) q = q.eq("incapacidad_id", incapacidadId)
    return q.range(d, h)
  })
  return filas.map(aPago)
}

type FilaPqrd = {
  id: string
  incapacidad_id: string
  radicado: string
  entidad: string
  fecha_radicacion: string
  motivo: string
  fecha_limite: string
  estado: Pqrd["estado"]
  fecha_respuesta: string | null
  resumen_respuesta: string | null
  soporte_path: string | null
  created_by: string
  created_at: string
}

export const aPqrd = (f: FilaPqrd) => ({
  id: f.id,
  incapacidadId: f.incapacidad_id,
  radicado: f.radicado,
  entidad: f.entidad,
  fechaRadicacion: f.fecha_radicacion,
  motivo: f.motivo,
  fechaLimite: f.fecha_limite,
  estado: f.estado,
  fechaRespuesta: f.fecha_respuesta,
  resumenRespuesta: f.resumen_respuesta,
  tieneSoporte: Boolean(f.soporte_path),
  creadoPor: f.created_by,
  creadoAt: f.created_at,
})

export async function listarPqrd(db: SupabaseClient, incapacidadId?: string) {
  const filas = await todas<FilaPqrd>((d, h) => {
    let q = db.from("incapacidad_pqrd").select("*").order("fecha_radicacion").order("id")
    if (incapacidadId) q = q.eq("incapacidad_id", incapacidadId)
    return q.range(d, h)
  })
  return filas.map(aPqrd)
}

export async function listarGestiones(db: SupabaseClient, incapacidadId?: string) {
  const filas = await todas<{
    id: string; incapacidad_id: string; fecha: string; tipo: string; accion: string
    responsable: string | null; created_by: string; created_at: string
  }>((d, h) => {
    let q = db.from("incapacidad_gestiones").select("*").order("fecha").order("created_at")
    if (incapacidadId) q = q.eq("incapacidad_id", incapacidadId)
    return q.range(d, h)
  })
  return filas.map((f) => ({
    id: f.id, incapacidadId: f.incapacidad_id, fecha: f.fecha, tipo: f.tipo, accion: f.accion,
    responsable: f.responsable, creadoPor: f.created_by, creadoAt: f.created_at,
  }))
}

// ─── Fondos de pensiones (maestro de colaboradores) ───────────────────────────

export async function fondosPorIdentificacion(db: SupabaseClient): Promise<Map<string, string>> {
  const filas = await todas<{ identificacion: string; fondo_pensiones: string }>((d, h) =>
    db.from("colaboradores").select("identificacion, fondo_pensiones").not("fondo_pensiones", "is", null).order("identificacion").range(d, h),
  )
  return new Map(filas.map((f) => [f.identificacion, f.fondo_pensiones]))
}

/**
 * Registra el fondo de un colaborador; si no está en el maestro lo crea con el
 * nombre de la incapacidad (el maestro se completa en la próxima importación).
 */
export async function asignarFondo(
  db: SupabaseClient,
  identificacion: string,
  nombre: string,
  fondo: string,
  usuario: string,
): Promise<void> {
  const { data: actual, error: e1 } = await db
    .from("colaboradores").select("fondo_pensiones").eq("identificacion", identificacion).maybeSingle()
  if (e1) throw new Error(e1.message)
  if (actual?.fondo_pensiones === fondo) return // sin cambios: no se escribe ni se audita
  const ahora = new Date().toISOString()
  const { error } = actual
    ? await db.from("colaboradores").update({ fondo_pensiones: fondo, updated_by: usuario, updated_at: ahora }).eq("identificacion", identificacion)
    : await db.from("colaboradores").insert({
        identificacion, nombre, fondo_pensiones: fondo, origen: "Incapacidades", created_by: usuario, updated_by: usuario,
      })
  if (error) throw new Error(error.message)
  await auditar(db, [{
    tabla: "colaboradores", registro_id: identificacion, accion: actual ? "update" : "insert",
    campo: "fondo_pensiones", valor_anterior: actual?.fondo_pensiones ?? null, valor_nuevo: fondo, usuario,
  }])
}

// ─── Auditoría ────────────────────────────────────────────────────────────────

export interface FilaAuditoria {
  tabla: string
  registro_id: string
  accion: string
  campo?: string | null
  valor_anterior?: unknown
  valor_nuevo?: unknown
  usuario: string
}

export async function auditar(db: SupabaseClient, filas: FilaAuditoria[]): Promise<void> {
  if (!filas.length) return
  const { error } = await db.from("incapacidad_auditoria").insert(
    filas.map((f) => ({ ...f, valor_anterior: f.valor_anterior ?? null, valor_nuevo: f.valor_nuevo ?? null })),
  )
  // La auditoría no debe tumbar la operación ya hecha, pero sí quedar en el log.
  if (error) console.error("Auditoría incapacidades:", error.message)
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

/**
 * Evalúa hitos de días acumulados (y previas) y PQRD vencidas, e inserta solo
 * las alertas nuevas: la `clave` única hace que nunca se repitan, aunque se
 * evalúe muchas veces (después de cada carga o edición, y a diario).
 */
export async function evaluarAlertas(
  db: SupabaseClient,
  ahora: Date = new Date(),
): Promise<{ corte: FechaISO; evaluadas: number; nuevas: number }> {
  const [params, incs, fondos, pqrds] = await Promise.all([
    leerParametros(db), listarIncapacidades(db), fondosPorIdentificacion(db), listarPqrd(db),
  ])
  const corte = fechaCorteEfectiva(params, ahora)
  const idPorLlave = new Map(incs.map((i) => [llaveIncapacidad(i.identificacion, i.nroIncapacidad), i.id!]))
  const incPorId = new Map(incs.map((i) => [i.id!, i]))

  const filas: Record<string, unknown>[] = alertasDiasAcumulados(incs, { params, corte, fondos }).map((a) => ({
    clave: a.clave,
    tipo: a.tipo,
    identificacion: a.identificacion,
    nombre: a.nombre,
    cadena: a.cadena,
    hito: a.hito,
    dias_acumulados: a.diasAcumulados,
    fecha_cumplimiento: a.fechaCumplimiento,
    incapacidad_id: idPorLlave.get(llaveIncapacidad(a.identificacion, a.nroIncapacidad)) ?? null,
    eps: a.eps,
    accion_sugerida: a.accionSugerida,
  }))

  for (const p of pqrds) {
    if (!pqrdVencida(p, corte)) continue
    const inc = incPorId.get(p.incapacidadId)
    if (!inc) continue
    filas.push({
      clave: `pqrd|${p.id}`,
      tipo: "pqrd_vencida",
      identificacion: inc.identificacion,
      nombre: inc.nombre,
      fecha_cumplimiento: p.fechaLimite,
      incapacidad_id: inc.id,
      pqrd_id: p.id,
      eps: p.entidad,
      accion_sugerida: `PQRD ${p.radicado} sin respuesta: venció el ${p.fechaLimite}. Hacer seguimiento con ${p.entidad}.`,
    })
  }

  let nuevas = 0
  for (let i = 0; i < filas.length; i += 500) {
    const { data, error } = await db
      .from("incapacidad_alertas")
      .upsert(filas.slice(i, i + 500), { onConflict: "clave", ignoreDuplicates: true })
      .select("id")
    if (error) throw new Error(error.message)
    nuevas += data?.length ?? 0
  }
  return { corte, evaluadas: filas.length, nuevas }
}

// ─── Cobro de una incapacidad (después de pagar, anular o editar) ─────────────

export async function cobroDeIncapacidad(db: SupabaseClient, inc: Incapacidad, ahora: Date = new Date()) {
  const [params, pagos, pqrds, fondoFila] = await Promise.all([
    leerParametros(db),
    listarPagos(db, inc.id),
    listarPqrd(db, inc.id),
    db.from("colaboradores").select("fondo_pensiones").eq("identificacion", inc.identificacion).maybeSingle(),
  ])
  if (fondoFila.error) throw new Error(fondoFila.error.message)
  const corte = fechaCorteEfectiva(params, ahora)
  const cobro = calcularCobro(inc, pagos, {
    params,
    corte,
    fondo: fondoFila.data?.fondo_pensiones ?? null,
    tienePqrdAbierta: pqrds.some((p) => p.estado === "Abierta"),
  })
  return { params, corte, cobro }
}

/** Incapacidad → objeto que espera la función SQL incapacidades_importar. */
export function filaParaImportar(i: Incapacidad, entidadKactus: string | null = null) {
  return {
    identificacion: i.identificacion,
    nro_incapacidad: i.nroIncapacidad,
    nombre: i.nombre,
    concepto: i.concepto,
    tipo: i.tipo,
    es_prorroga: i.esProrroga,
    dias: i.dias,
    dias_acumulados: i.diasAcumulados,
    fecha_desde: i.fechaDesde,
    fecha_hasta: i.fechaHasta,
    fecha_radicacion_nomina: i.fechaRadicacionNomina,
    fecha_radicacion_eps: i.fechaRadicacionEps,
    valor_incapacidad: i.valorIncapacidad,
    eps: i.eps,
    entidad_kactus: entidadKactus,
    valor_fondo_manual: i.valorFondoManual,
    estado: i.estado,
    causal_no_pago: i.causalNoPago,
    responsable: i.responsable,
    observacion: i.observacion,
    fin_lactancia: i.finLactancia,
    sugerido_transito: i.sugeridoTransito,
    para_revisar: i.paraRevisar,
    origen: i.origen,
  }
}
