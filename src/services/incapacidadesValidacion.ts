/**
 * Validación de lo que llega a app/api/incapacidades/*. Nunca se confía en el
 * navegador: listas blancas de campos, tipos, fechas y reglas del
 * requerimiento (causal obligatoria, motivo para reabrir/castigar, etc.).
 * Funciones puras: las rutas solo las llaman y traducen el resultado a HTTP.
 */

import { diasFondo } from "@/src/services/incapacidadesEngine"
import type { FilaKactus, FilaRechazada } from "@/src/services/incapacidadesParser"
import { IDENTIFICACION_VALIDA } from "@/src/types/colaborador"
import { ESTADO, type FechaISO, type Incapacidad, type ParametrosIncapacidades, type Tramo } from "@/src/types/incapacidad"

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

const ok = <T,>(valor: T): Resultado<T> => ({ ok: true, valor })
const error = (mensaje: string): { ok: false; error: string } => ({ ok: false, error: mensaje })

const MAX_TEXTO = 2000
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

function texto(v: unknown, campo: string, { requerido = false, max = MAX_TEXTO } = {}): Resultado<string | null> {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return requerido ? error(`${campo} es obligatorio`) : ok(null)
  }
  if (typeof v !== "string") return error(`${campo} debe ser texto`)
  const t = v.trim()
  if (t.length > max) return error(`${campo} supera ${max} caracteres`)
  return ok(t)
}

function esFechaValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function fecha(v: unknown, campo: string, { requerido = false, maximo }: { requerido?: boolean; maximo?: FechaISO } = {}): Resultado<FechaISO | null> {
  if (v === null || v === undefined || v === "") return requerido ? error(`${campo} es obligatoria`) : ok(null)
  if (typeof v !== "string" || !esFechaValida(v)) return error(`${campo} no es una fecha válida (AAAA-MM-DD)`)
  if (maximo && v > maximo) return error(`${campo} no puede ser posterior a hoy`)
  return ok(v)
}

function entero(v: unknown, campo: string, { minimo = 0, permitirNull = false } = {}): Resultado<number | null> {
  if ((v === null || v === undefined || v === "") && permitirNull) return ok(null)
  if (typeof v !== "number" || !Number.isInteger(v)) return error(`${campo} debe ser un número entero`)
  if (v < minimo) return error(`${campo} debe ser mayor o igual a ${minimo}`)
  return ok(v)
}

function deLista(v: string | null, lista: string[], campo: string): Resultado<string | null> {
  if (v === null) return ok(null)
  return lista.includes(v) ? ok(v) : error(`${campo} no está en la lista: ${v}`)
}

export const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// ─── Pagos (RF-03) ────────────────────────────────────────────────────────────

export interface PagoNuevo {
  fechaPago: FechaISO
  valor: number
  tramo: Tramo
  observacion: string | null
}

export function validarPago(body: unknown, hoy: FechaISO): Resultado<PagoNuevo> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const f = fecha(body.fechaPago, "La fecha de pago", { requerido: true, maximo: hoy })
  if (!f.ok) return f
  if (typeof body.valor !== "number" || !Number.isFinite(body.valor) || body.valor <= 0) {
    return error("El valor pagado debe ser mayor que 0")
  }
  const tramo = body.tramo ?? "eps"
  if (tramo !== "eps" && tramo !== "fondo") return error("El tramo debe ser 'eps' o 'fondo'")
  const obs = texto(body.observacion, "La observación", { max: 500 })
  if (!obs.ok) return obs
  return ok({ fechaPago: f.valor!, valor: Math.round(body.valor), tramo, observacion: obs.valor })
}

export function validarMotivo(body: unknown, campo = "El motivo"): Resultado<string> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const m = texto(body.motivo, campo, { requerido: true, max: 500 })
  return m.ok ? ok(m.valor!) : m
}

// ─── Gestiones (RF-04) ────────────────────────────────────────────────────────

export const TIPOS_GESTION = ["Llamada", "Correo", "Reclamación", "Visita", "Otra"]

export function validarGestion(body: unknown, hoy: FechaISO) {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const f = fecha(body.fecha, "La fecha", { requerido: true, maximo: hoy })
  if (!f.ok) return f
  const tipo = texto(body.tipo, "El tipo", { requerido: true, max: 40 })
  if (!tipo.ok) return tipo
  if (!TIPOS_GESTION.includes(tipo.valor!)) return error(`Tipo de gestión no válido. Opciones: ${TIPOS_GESTION.join(", ")}`)
  const accion = texto(body.accion, "La acción", { requerido: true })
  if (!accion.ok) return accion
  const responsable = texto(body.responsable, "El responsable", { max: 120 })
  if (!responsable.ok) return responsable
  return ok({ fecha: f.valor!, tipo: tipo.valor!, accion: accion.valor!, responsable: responsable.valor })
}

// ─── PQRD ─────────────────────────────────────────────────────────────────────

export function validarPqrdNueva(body: unknown, params: ParametrosIncapacidades, hoy: FechaISO) {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const radicado = texto(body.radicado, "El Nº de radicado", { requerido: true, max: 80 })
  if (!radicado.ok) return radicado
  const entidad = texto(body.entidad, "La entidad", { requerido: true, max: 80 })
  if (!entidad.ok) return entidad
  const ent = deLista(entidad.valor, [...params.listaEps, ...params.listaFondos], "La entidad")
  if (!ent.ok) return ent
  const f = fecha(body.fechaRadicacion, "La fecha de radicación", { requerido: true, maximo: hoy })
  if (!f.ok) return f
  const motivo = texto(body.motivo, "El motivo", { requerido: true })
  if (!motivo.ok) return motivo
  return ok({ radicado: radicado.valor!, entidad: entidad.valor!, fechaRadicacion: f.valor!, motivo: motivo.valor! })
}

export const ESTADOS_PQRD = ["Abierta", "Respondida a favor", "Respondida en contra"] as const

export function validarRespuestaPqrd(body: unknown, hoy: FechaISO) {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  if (!ESTADOS_PQRD.includes(body.estado as (typeof ESTADOS_PQRD)[number])) {
    return error(`Estado de PQRD no válido. Opciones: ${ESTADOS_PQRD.join(", ")}`)
  }
  const estado = body.estado as (typeof ESTADOS_PQRD)[number]
  const respondida = estado !== "Abierta"
  const f = fecha(body.fechaRespuesta, "La fecha de respuesta", { requerido: respondida, maximo: hoy })
  if (!f.ok) return f
  const resumen = texto(body.resumenRespuesta, "El resumen de la respuesta", { requerido: respondida })
  if (!resumen.ok) return resumen
  return ok({ estado, fechaRespuesta: f.valor, resumenRespuesta: resumen.valor })
}

// ─── Edición de seguimiento ───────────────────────────────────────────────────

/** Columnas de BD que el usuario puede cambiar. */
export interface CambiosIncapacidad {
  fecha_radicacion_eps?: FechaISO | null
  estado?: string
  causal_no_pago?: string | null
  responsable?: string | null
  tipo?: string
  es_prorroga?: boolean
  dias_acumulados?: number
  valor_fondo_manual?: number | null
  observacion?: string | null
}

export interface Edicion {
  cambios: CambiosIncapacidad
  motivo: string | null
  /** Cambió algo que mueve los días acumulados o la cadena: hay que reevaluar alertas. */
  reevaluarAlertas: boolean
}

const ESTADOS_CON_CAUSAL: string[] = [ESTADO.rechazada, ESTADO.sinSubsidio]
const ESTADOS_CON_MOTIVO: string[] = [ESTADO.castigada, ESTADO.prescrita]

/** Valida los cambios de UNA incapacidad contra su estado actual. */
export function validarEdicion(
  body: unknown,
  actual: Incapacidad,
  params: ParametrosIncapacidades,
  hoy: FechaISO,
): Resultado<Edicion> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const c: CambiosIncapacidad = {}

  if ("fechaRadicacionEps" in body) {
    const r = fecha(body.fechaRadicacionEps, "La fecha de radicación EPS", { maximo: hoy })
    if (!r.ok) return r
    c.fecha_radicacion_eps = r.valor
  }
  if ("estado" in body) {
    const r = texto(body.estado, "El estado", { requerido: true, max: 40 })
    if (!r.ok) return r
    const l = deLista(r.valor, params.listaEstados, "El estado")
    if (!l.ok) return l
    c.estado = r.valor!
  }
  if ("causalNoPago" in body) {
    const r = texto(body.causalNoPago, "La causal", { max: 200 })
    if (!r.ok) return r
    const l = deLista(r.valor, params.listaCausales, "La causal")
    if (!l.ok) return l
    c.causal_no_pago = r.valor
  }
  if ("responsable" in body) {
    const r = texto(body.responsable, "El responsable", { max: 120 })
    if (!r.ok) return r
    c.responsable = r.valor
  }
  if ("tipo" in body) {
    const r = texto(body.tipo, "El tipo", { requerido: true, max: 60 })
    if (!r.ok) return r
    const l = deLista(r.valor, params.listaTipos, "El tipo")
    if (!l.ok) return l
    c.tipo = r.valor!
  }
  if ("esProrroga" in body) {
    if (typeof body.esProrroga !== "boolean") return error("¿Es prórroga? debe ser verdadero o falso")
    c.es_prorroga = body.esProrroga
  }
  if ("diasAcumulados" in body) {
    const r = entero(body.diasAcumulados, "Los días acumulados", { minimo: actual.dias })
    if (!r.ok) return error(`${r.error} (los días de la incapacidad)`)
    c.dias_acumulados = r.valor!
  }
  if ("valorFondoManual" in body) {
    const r = entero(body.valorFondoManual, "El valor a cobrar al fondo", { permitirNull: true })
    if (!r.ok) return r
    c.valor_fondo_manual = r.valor
  }
  if ("observacion" in body) {
    const r = texto(body.observacion, "La observación")
    if (!r.ok) return r
    c.observacion = r.valor
  }
  const motivo = texto(body.motivo, "El motivo", { max: 500 })
  if (!motivo.ok) return motivo

  if (Object.keys(c).length === 0) return error("No hay cambios")

  // Reglas sobre el resultado final.
  const estadoFinal = c.estado ?? actual.estado
  const causalFinal = "causal_no_pago" in c ? c.causal_no_pago : actual.causalNoPago
  const cambiaEstado = c.estado !== undefined && c.estado !== actual.estado

  if (ESTADOS_CON_CAUSAL.includes(estadoFinal) && !causalFinal) {
    return error(`Para marcar "${estadoFinal}" hay que indicar la causal de no pago`)
  }
  if (cambiaEstado && ESTADOS_CON_MOTIVO.includes(estadoFinal) && !motivo.valor) {
    return error(`Para pasar a "${estadoFinal}" hay que indicar el motivo`)
  }
  if (cambiaEstado && actual.estado === ESTADO.sinSubsidio && !motivo.valor) {
    return error('Para reabrir una incapacidad "Sin subsidio" hay que indicar el motivo')
  }
  if (cambiaEstado && estadoFinal === ESTADO.sinSubsidio) {
    const final = {
      tipo: c.tipo ?? actual.tipo,
      dias: actual.dias,
      diasAcumulados: c.dias_acumulados ?? actual.diasAcumulados,
    }
    if (diasFondo(final) === final.dias) {
      return error("Una incapacidad de más de 180 días no se marca sin subsidio: se cobra al fondo de pensiones")
    }
  }

  return ok({
    cambios: c,
    motivo: motivo.valor,
    reevaluarAlertas: c.tipo !== undefined || c.dias_acumulados !== undefined || c.es_prorroga !== undefined,
  })
}

/** Registro masivo: mismo cambio a varias incapacidades (estado, causal, radicación EPS o responsable). */
export function validarMasivo(body: unknown) {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0) return error("Seleccione al menos una incapacidad")
  if (ids.length > 1000) return error("Máximo 1000 incapacidades por cambio masivo")
  if (!ids.every((i) => typeof i === "string" && esUuid(i))) return error("Identificadores inválidos")
  if (!esObjeto(body.cambios)) return error("Faltan los cambios")
  const permitidos = ["estado", "causalNoPago", "fechaRadicacionEps", "responsable", "motivo"]
  const extra = Object.keys(body.cambios).filter((k) => !permitidos.includes(k))
  if (extra.length) return error(`El cambio masivo solo admite: estado, causal, fecha de radicación EPS o responsable`)
  return ok({ ids: [...new Set(ids as string[])], cambios: body.cambios })
}

// ─── Carga de KactuS ─────────────────────────────────────────────────────────

export interface EntradaCarga {
  archivo: string
  filas: FilaKactus[]
  rechazadas: FilaRechazada[]
  /** EPS asignada por el usuario a filas cuya entidad no está en la lista (por Nº de fila). */
  epsAsignadas: Record<string, string>
  /** Fondo asignado a colaboradores que pasan a cobro al fondo sin fondo registrado. */
  fondosAsignados: Record<string, string>
}

const MAX_FILAS_CARGA = 20_000

/**
 * Reconstruye las filas leídas en el navegador con lista blanca de campos (el
 * diagnóstico nunca llega: solo la marca sugeridoTransito).
 */
export function validarCarga(body: unknown, params: ParametrosIncapacidades): Resultado<EntradaCarga> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const archivo = texto(body.archivo, "El nombre del archivo", { requerido: true, max: 200 })
  if (!archivo.ok) return archivo
  if (!/\.xlsx$/i.test(archivo.valor!)) return error("El archivo debe ser .xlsx")
  if (!Array.isArray(body.filas)) return error("Faltan las filas del archivo")
  if (body.filas.length > MAX_FILAS_CARGA) return error(`Máximo ${MAX_FILAS_CARGA} filas por archivo`)

  const filas: FilaKactus[] = []
  for (let i = 0; i < body.filas.length; i++) {
    const f = body.filas[i]
    const donde = `Fila ${esObjeto(f) && typeof f.fila === "number" ? f.fila : i + 2}`
    if (!esObjeto(f)) return error(`${donde}: formato inválido`)
    const req = (campo: string, v: Resultado<unknown>) => (v.ok ? null : `${donde}: ${v.error} (${campo})`)

    const ident = texto(f.identificacion, "Identificación", { requerido: true, max: 20 })
    const nro = texto(f.nroIncapacidad, "Nº incapacidad", { requerido: true, max: 60 })
    const nombre = texto(f.nombre, "Nombre", { requerido: true, max: 200 })
    const desde = fecha(f.fechaDesde, "Fecha desde", { requerido: true })
    const hasta = fecha(f.fechaHasta, "Fecha hasta", { requerido: true })
    const radic = fecha(f.fechaRadicacionNomina, "Fecha radicación")
    const lact = fecha(f.finLactancia, "Fecha final de lactancia")
    const dias = entero(f.dias, "Número días")
    const acum = entero(f.diasAcumulados, "Días totales")
    const valor = entero(f.valorIncapacidad, "Valor incapacidad")
    const tipo = texto(f.tipo, "Tipo", { requerido: true, max: 60 })
    const ent = texto(f.entidadKactus, "Entidad", { max: 200 })
    const eps = texto(f.eps, "EPS", { max: 80 })
    const obs = texto(f.observacion, "Observaciones")
    const fallo = [
      req("identificación", ident), req("Nº", nro), req("nombre", nombre), req("desde", desde), req("hasta", hasta),
      req("radicación", radic), req("lactancia", lact), req("días", dias), req("acumulados", acum), req("valor", valor),
      req("tipo", tipo), req("entidad", ent), req("eps", eps), req("observación", obs),
    ].find(Boolean)
    if (fallo) return error(fallo)
    // Ninguno falló: ya se pueden leer los valores.
    const val = <T,>(r: Resultado<T>): T => (r as { ok: true; valor: T }).valor
    // Alfanumérica: KactuS puede traer pasaporte o PPT de extranjeros.
    if (!IDENTIFICACION_VALIDA.test(val(ident)!)) return error(`${donde}: identificación inválida`)
    if (val(hasta)! < val(desde)!) return error(`${donde}: Fecha hasta anterior a Fecha desde`)
    if (!params.listaTipos.includes(val(tipo)!)) return error(`${donde}: tipo no válido`)
    const epsValor = val(eps)
    if (epsValor !== null && !params.listaEps.includes(epsValor)) return error(`${donde}: EPS no está en la lista`)

    filas.push({
      fila: typeof f.fila === "number" ? f.fila : i + 2,
      identificacion: val(ident)!,
      nombre: val(nombre)!,
      nroIncapacidad: val(nro)!,
      concepto: typeof f.concepto === "number" ? f.concepto : null,
      tipo: val(tipo)!,
      conceptoDesconocido: f.conceptoDesconocido === true,
      esProrroga: f.esProrroga === true,
      dias: val(dias)!,
      diasAcumulados: Math.max(val(acum)!, val(dias)!),
      fechaDesde: val(desde)!,
      fechaHasta: val(hasta)!,
      fechaRadicacionNomina: val(radic),
      valorIncapacidad: val(valor)!,
      entidadKactus: val(ent) ?? "",
      eps: val(eps),
      finLactancia: val(lact),
      observacion: val(obs),
      sugeridoTransito: f.sugeridoTransito === true,
    })
  }

  const rechazadas: FilaRechazada[] = Array.isArray(body.rechazadas)
    ? body.rechazadas.slice(0, MAX_FILAS_CARGA).filter(esObjeto).map((r) => ({
        fila: typeof r.fila === "number" ? r.fila : 0,
        identificacion: String(r.identificacion ?? "").slice(0, 20),
        nroIncapacidad: String(r.nroIncapacidad ?? "").slice(0, 60),
        motivo: String(r.motivo ?? "").slice(0, 200),
      }))
    : []

  const epsAsignadas: Record<string, string> = {}
  if (esObjeto(body.epsAsignadas)) {
    for (const [fila, eps] of Object.entries(body.epsAsignadas)) {
      if (typeof eps !== "string" || !params.listaEps.includes(eps)) return error(`EPS asignada no válida en la fila ${fila}`)
      epsAsignadas[fila] = eps
    }
  }
  const fondosAsignados: Record<string, string> = {}
  if (esObjeto(body.fondosAsignados)) {
    for (const [ident, fondo] of Object.entries(body.fondosAsignados)) {
      if (typeof fondo !== "string" || !params.listaFondos.includes(fondo)) return error(`Fondo no válido para ${ident}`)
      fondosAsignados[ident] = fondo
    }
  }

  return ok({ archivo: archivo.valor!, filas, rechazadas, epsAsignadas, fondosAsignados })
}

// ─── Parámetros (RF-10) ───────────────────────────────────────────────────────

const LISTAS: (keyof ParametrosIncapacidades)[] = ["listaEps", "listaFondos", "listaEstados", "listaCausales", "listaTipos"]
const NUMEROS: (keyof ParametrosIncapacidades)[] = [
  "diasMora", "mesesPrescripcion", "mesesAnticipacionPrescripcion", "toleranciaRedondeo",
  "diasHabilesPqrd", "diasAlertaPrevia", "diasMinimosSugerenciaTransito",
]
/** Valores que la app usa por nombre en sus reglas: no se pueden quitar de las listas. */
const OBLIGATORIOS: Partial<Record<keyof ParametrosIncapacidades, string[]>> = {
  listaEstados: Object.values(ESTADO),
  listaTipos: ["Enfermedad general", "Licencia de maternidad", "Licencia de paternidad", "Accidente de tránsito"],
}

export function validarParametros(body: unknown): Resultado<Partial<ParametrosIncapacidades>> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const out: Partial<ParametrosIncapacidades> = {}
  const asignar = <K extends keyof ParametrosIncapacidades>(k: K, v: ParametrosIncapacidades[K]) => { out[k] = v }

  for (const [k, v] of Object.entries(body)) {
    const clave = k as keyof ParametrosIncapacidades
    if (clave === "fechaCorte") {
      const f = fecha(v, "La fecha de corte")
      if (!f.ok) return f
      asignar("fechaCorte", f.valor)
    } else if (NUMEROS.includes(clave)) {
      const n = entero(v, k)
      if (!n.ok) return n
      if (n.valor! > 100_000) return error(`${k} es demasiado grande`)
      asignar(clave, n.valor as never)
    } else if (clave === "hitosDias") {
      if (!Array.isArray(v) || !v.length || !v.every((x) => Number.isInteger(x) && x > 0 && x <= 1000)) {
        return error("Los hitos deben ser días enteros positivos")
      }
      asignar("hitosDias", [...new Set(v as number[])].sort((a, b) => a - b))
    } else if (clave === "correosAlertas") {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) {
        return error("Los correos no son válidos")
      }
      asignar("correosAlertas", [...new Set((v as string[]).map((x) => x.trim().toLowerCase()))])
    } else if (LISTAS.includes(clave)) {
      if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === "string" && x.trim() && x.length <= 200)) {
        return error(`${k} debe ser una lista de textos no vacía`)
      }
      const lista = [...new Set((v as string[]).map((x) => x.trim()))]
      const faltan = (OBLIGATORIOS[clave] ?? []).filter((x) => !lista.includes(x))
      if (faltan.length) return error(`${k} debe incluir: ${faltan.join(", ")}`)
      asignar(clave, lista as never)
    } else {
      return error(`Parámetro desconocido: ${k}`)
    }
  }
  if (!Object.keys(out).length) return error("No hay cambios")
  return ok(out)
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export function validarAtencion(body: unknown): Resultado<string> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const nota = texto(body.nota, "La nota", { requerido: true, max: 500 })
  return nota.ok ? ok(nota.valor!) : nota
}
