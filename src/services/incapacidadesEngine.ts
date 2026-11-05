/**
 * Motor de Incapacidades — ÚNICA fuente de verdad del módulo.
 *
 * Funciones puras (sin BD ni UI): saldo, alerta de cobro, prescripción, tramos
 * de cobro EPS/fondo, estado propuesto tras un pago, cadenas de prórroga,
 * alertas de días acumulados, vistas de tránsito y maternidad, Resumen de
 * cartera y plazo de PQRD. La tabla de Seguimiento, el Resumen, la
 * exportación y las alertas solo leen de aquí; nunca dupliquen estas reglas.
 *
 * Las reglas de cobro replican las fórmulas del libro "Seguimiento de
 * incapacidades 2026" (hoja Seguimiento, columnas P–S) para que la app dé los
 * mismos resultados que el Excel.
 */

import { isFestivoColombia } from "@/src/services/festivosColombia"
import {
  ESTADO,
  TIPO,
  type AlertaCobro,
  type AlertaDias,
  type CobroCalculado,
  type FechaISO,
  type Incapacidad,
  type Pago,
  type ParametrosIncapacidades,
  type Pqrd,
  type TramoCobro,
} from "@/src/types/incapacidad"

// ─── Fechas (ISO "YYYY-MM-DD", aritmética en UTC para no correr días) ──────────

const MS_DIA = 86_400_000

function partes(iso: FechaISO): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function aMs(iso: FechaISO): number {
  const [y, m, d] = partes(iso)
  return Date.UTC(y, m - 1, d)
}

function deMs(ms: number): FechaISO {
  return new Date(ms).toISOString().slice(0, 10)
}

export function sumarDias(iso: FechaISO, dias: number): FechaISO {
  return deMs(aMs(iso) + dias * MS_DIA)
}

/** a − b en días. */
export function diferenciaDias(a: FechaISO, b: FechaISO): number {
  return Math.round((aMs(a) - aMs(b)) / MS_DIA)
}

/** Igual que EDATE de Excel: mismo día n meses después, ajustado al fin de mes. */
export function sumarMeses(iso: FechaISO, meses: number): FechaISO {
  const [y, m, d] = partes(iso)
  const total = y * 12 + (m - 1) + meses
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return deMs(Date.UTC(ny, nm, Math.min(d, ultimo)))
}

/** Hoy en Colombia (RNF-05), aunque el servidor corra en UTC. */
export function hoyBogota(ahora: Date = new Date()): FechaISO {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora)
}

export function fechaCorteEfectiva(params: ParametrosIncapacidades, ahora?: Date): FechaISO {
  return params.fechaCorte ?? hoyBogota(ahora)
}

export function esDiaHabil(iso: FechaISO): boolean {
  const [y, m, d] = partes(iso)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !isFestivoColombia(new Date(y, m - 1, d))
}

/** Suma n días hábiles (sin sábados, domingos ni festivos de Colombia). */
export function sumarDiasHabiles(iso: FechaISO, n: number): FechaISO {
  let fecha = iso
  let contados = 0
  while (contados < n) {
    fecha = sumarDias(fecha, 1)
    if (esDiaHabil(fecha)) contados++
  }
  return fecha
}

// ─── Llaves ───────────────────────────────────────────────────────────────────

/** Llave de la incapacidad: Identificación + Nº, sin espacios a los lados. */
export function llaveIncapacidad(identificacion: string | number, nro: string | number): string {
  return `${String(identificacion).trim()}|${String(nro).trim()}`
}

// ─── Tramos de cobro: EPS hasta el día 180, fondo de pensiones desde el 181 ───

export const DIA_LIMITE_EPS = 180
export const FONDO_SIN_ASIGNAR = "Fondo de pensiones (sin asignar)"

/**
 * La regla del día 181 aplica a incapacidades de origen común. Las licencias
 * (maternidad/paternidad) no son incapacidades por enfermedad, y las de origen
 * laboral las paga la ARL con sus propias reglas.
 */
export function aplicaCobroFondo(tipo: string): boolean {
  return tipo === TIPO.enfermedadGeneral || tipo === TIPO.transito
}

/** Días de esta incapacidad que caen después del día 180 acumulado. */
export function diasFondo(inc: Pick<Incapacidad, "tipo" | "dias" | "diasAcumulados">): number {
  if (!aplicaCobroFondo(inc.tipo)) return 0
  const exceso = inc.diasAcumulados - DIA_LIMITE_EPS
  if (exceso <= 0) return 0
  return Math.min(exceso, inc.dias)
}

function sumaPagos(pagos: Pago[], tramo?: TramoCobro["tramo"]): number {
  return pagos
    .filter((p) => !p.anulado && (tramo === undefined || p.tramo === tramo))
    .reduce((s, p) => s + p.valor, 0)
}

/**
 * Reparte el cobro entre EPS y fondo de pensiones.
 *  - Todo en la EPS si no supera 180 días.
 *  - Todo en el fondo si empieza después del día 180.
 *  - Si cruza el día 180 (p. ej. de 177 a 192) se divide: el valor del fondo es
 *    el digitado por nómina o, si no hay, proporcional a los días.
 * "Sin subsidio" no se cobra a nadie: valor 0.
 */
export function tramosCobro(inc: Incapacidad, pagos: Pago[], fondo: string | null): TramoCobro[] {
  const base = inc.estado === ESTADO.sinSubsidio ? 0 : inc.valorIncapacidad
  const dFondo = diasFondo(inc)
  const entidadEps = inc.eps ?? "(sin EPS)"
  const entidadFondo = fondo ?? FONDO_SIN_ASIGNAR

  const tramo = (t: TramoCobro["tramo"], entidad: string, dias: number, valor: number): TramoCobro => {
    const pagado = sumaPagos(pagos, t)
    return { tramo: t, entidad, dias, valor, pagado, saldo: valor - pagado }
  }

  if (dFondo === 0) return [tramo("eps", entidadEps, inc.dias, base)]

  const manual = inc.estado === ESTADO.sinSubsidio ? null : inc.valorFondoManual
  const dEps = inc.dias - dFondo
  if (dEps === 0) {
    const tramos = [tramo("fondo", entidadFondo, dFondo, manual ?? base)]
    // Pagos que hizo la EPS antes de reasignar el cobro no se pierden.
    if (sumaPagos(pagos, "eps") > 0) tramos.unshift(tramo("eps", entidadEps, 0, 0))
    return tramos
  }

  const valorFondo = manual ?? Math.round((base * dFondo) / inc.dias)
  return [
    tramo("eps", entidadEps, dEps, Math.max(0, base - valorFondo)),
    tramo("fondo", entidadFondo, dFondo, valorFondo),
  ]
}

// ─── Cobro y alerta de cobro ─────────────────────────────────────────────────

export interface ContextoCobro {
  params: ParametrosIncapacidades
  corte: FechaISO
  fondo: string | null
  tienePqrdAbierta?: boolean
}

const ESTADOS_CERRADOS: readonly string[] = [ESTADO.pagada, ESTADO.castigada, ESTADO.prescrita, ESTADO.sinSubsidio]

/**
 * Alerta de cobro: la primera que se cumpla en este orden (fórmula S del Excel):
 * Cerrada → Riesgo prescripción → Rechazada: gestionar → Pago menor al valor → En mora → Al día.
 */
export function alertaCobro(args: {
  estado: string
  valor: number
  pagado: number
  hayPago: boolean
  diasDesdeRadicacion: number | null
  fechaPrescripcion: FechaISO
  corte: FechaISO
  params: ParametrosIncapacidades
  tienePqrdAbierta?: boolean
}): AlertaCobro {
  const { estado, valor, pagado, hayPago, params } = args
  const saldo = valor - pagado
  const tol = params.toleranciaRedondeo

  if (
    ESTADOS_CERRADOS.includes(estado) ||
    saldo <= 0 ||
    (hayPago && saldo <= tol && estado !== ESTADO.pagadaParcial)
  ) {
    return "Cerrada"
  }
  if (args.corte >= sumarMeses(args.fechaPrescripcion, -params.mesesAnticipacionPrescripcion)) {
    return "Riesgo prescripción"
  }
  // Sigue en "Rechazada: gestionar" hasta que se monte una PQRD o se cierre.
  if (estado === ESTADO.rechazada && !args.tienePqrdAbierta) return "Rechazada: gestionar"
  if (estado === ESTADO.pagadaParcial || (hayPago && pagado > 0 && saldo > tol)) {
    return "Pago menor al valor"
  }
  if (args.diasDesdeRadicacion !== null && args.diasDesdeRadicacion > params.diasMora) return "En mora"
  return "Al día"
}

export function calcularCobro(inc: Incapacidad, pagos: Pago[], ctx: ContextoCobro): CobroCalculado {
  const vigentes = pagos.filter((p) => !p.anulado)
  const tramos = tramosCobro(inc, vigentes, ctx.fondo)
  const valor = tramos.reduce((s, t) => s + t.valor, 0)
  const pagado = sumaPagos(vigentes)
  const saldo = valor - pagado

  const fechaUltimoPago = vigentes.reduce<FechaISO | null>(
    (max, p) => (max === null || p.fechaPago > max ? p.fechaPago : max),
    null,
  )

  // Desde la radicación EPS; si está vacía, desde la de nómina. Solo si hay saldo.
  const radicacion = inc.fechaRadicacionEps ?? inc.fechaRadicacionNomina
  const diasDesdeRadicacion = radicacion && saldo > 0 ? diferenciaDias(ctx.corte, radicacion) : null

  const fechaPrescripcion = sumarMeses(inc.fechaHasta, ctx.params.mesesPrescripcion)

  const alerta = alertaCobro({
    estado: inc.estado,
    valor,
    pagado,
    hayPago: vigentes.length > 0,
    diasDesdeRadicacion,
    fechaPrescripcion,
    corte: ctx.corte,
    params: ctx.params,
    tienePqrdAbierta: ctx.tienePqrdAbierta,
  })

  const avisos: string[] = []
  if (pagado > valor && vigentes.length > 0) avisos.push("Pagado mayor al valor registrado: validar")
  const tramoFondo = tramos.find((t) => t.tramo === "fondo")
  if (tramoFondo) {
    if (!ctx.fondo) avisos.push("Falta registrar el fondo de pensiones del colaborador")
    if (tramoFondo.valor === 0 && inc.estado !== ESTADO.sinSubsidio) {
      avisos.push("Falta digitar el valor a cobrar al fondo de pensiones")
    }
  }

  return { tramos, valor, pagado, saldo, fechaUltimoPago, diasDesdeRadicacion, fechaPrescripcion, alerta, avisos }
}

/**
 * Estado que la app propone después de registrar un pago (RF-03). El usuario
 * lo confirma o lo cambia.
 */
export function proponerEstadoTrasPago(
  valor: number,
  pagadoTotal: number,
  params: ParametrosIncapacidades,
): { estado: string; aviso: string | null } {
  const saldo = valor - pagadoTotal
  if (pagadoTotal > valor) return { estado: ESTADO.pagada, aviso: "Pagado mayor al valor registrado: validar" }
  if (saldo <= params.toleranciaRedondeo) return { estado: ESTADO.pagada, aviso: null }
  return { estado: ESTADO.pagadaParcial, aviso: null }
}

// ─── Cadenas de prórroga y alertas de días acumulados ─────────────────────────

/** Las licencias duran 126 días o menos y no son prórrogas por enfermedad. */
export function cuentaParaHitos(tipo: string): boolean {
  return tipo !== TIPO.maternidad && tipo !== TIPO.paternidad
}

function ordenCronologico(a: Incapacidad, b: Incapacidad): number {
  return (
    a.fechaHasta.localeCompare(b.fechaHasta) ||
    a.fechaDesde.localeCompare(b.fechaDesde) ||
    a.diasAcumulados - b.diasAcumulados
  )
}

export interface Cadena {
  /** Nº de la incapacidad que abre la cadena. */
  id: string
  identificacion: string
  incapacidades: Incapacidad[]
}

/**
 * Agrupa por colaborador en cadenas: una incapacidad con "¿Es prórroga? = Sí"
 * continúa la cadena; una con "No" la reinicia.
 */
export function construirCadenas(incs: Incapacidad[]): Cadena[] {
  const porColaborador = new Map<string, Incapacidad[]>()
  for (const inc of incs) {
    if (!cuentaParaHitos(inc.tipo)) continue
    const id = inc.identificacion.trim()
    const lista = porColaborador.get(id) ?? []
    lista.push(inc)
    porColaborador.set(id, lista)
  }

  const cadenas: Cadena[] = []
  for (const [identificacion, lista] of porColaborador) {
    let actual: Cadena | null = null
    for (const inc of [...lista].sort(ordenCronologico)) {
      if (!actual || !inc.esProrroga) {
        actual = { id: inc.nroIncapacidad.trim(), identificacion, incapacidades: [] }
        cadenas.push(actual)
      }
      actual.incapacidades.push(inc)
    }
  }
  return cadenas
}

/**
 * Días acumulados a la fecha de corte: KactuS reporta el acumulado al final de
 * la incapacidad; si todavía no termina, solo cuentan los días ya transcurridos.
 */
export function diasAcumuladosAlCorte(inc: Incapacidad, corte: FechaISO): number {
  if (corte >= inc.fechaHasta) return inc.diasAcumulados
  const inicio = inc.diasAcumulados - inc.dias
  return Math.max(inicio, inc.diasAcumulados - diferenciaDias(inc.fechaHasta, corte))
}

/** Días acumulados del colaborador = los de su incapacidad más reciente (mayor Fecha hasta). */
export function diasAcumuladosColaborador(incs: Incapacidad[], identificacion: string, corte: FechaISO): number {
  const propias = incs
    .filter((i) => i.identificacion.trim() === identificacion.trim() && cuentaParaHitos(i.tipo))
    .sort(ordenCronologico)
  const ultima = propias[propias.length - 1]
  return ultima ? diasAcumuladosAlCorte(ultima, corte) : 0
}

export const ACCION_HITO: Record<number, string> = {
  90: "Pedir a la EPS el concepto de rehabilitación y revisar el caso con salud ocupacional",
  120: "Verificar que la EPS emitió el concepto de rehabilitación y que lo remitirá al fondo de pensiones antes del día 150",
  150: "Verificar que la EPS remitió el caso al fondo de pensiones (AFP)",
  180: "Desde el día 181 el subsidio lo paga el fondo de pensiones: verificar el fondo del colaborador y avisar a nómina",
}

function accionHito(hito: number, tieneFondo: boolean): string {
  let accion = ACCION_HITO[hito] ?? `Revisar el caso: el colaborador llega a ${hito} días acumulados`
  if (hito >= DIA_LIMITE_EPS && !tieneFondo) accion += " · Falta registrar el fondo de pensiones"
  return accion
}

/**
 * Alertas de 90/120/150/180 días (y la previa N días antes de cada hito), una
 * sola vez por colaborador, cadena e hito: la `clave` es estable para que la
 * BD las deduplique. Si una carga salta varios hitos se generan todas; la
 * previa solo se genera mientras el hito aún no se cumple.
 */
export function alertasDiasAcumulados(
  incs: Incapacidad[],
  ctx: { params: ParametrosIncapacidades; corte: FechaISO; fondos: Map<string, string> },
): AlertaDias[] {
  const alertas: AlertaDias[] = []
  const hitos = [...ctx.params.hitosDias].sort((a, b) => a - b)

  for (const cadena of construirCadenas(incs)) {
    const acumulados = cadena.incapacidades.map((i) => diasAcumuladosAlCorte(i, ctx.corte))
    const maxAcum = Math.max(...acumulados)
    const ultima = cadena.incapacidades[cadena.incapacidades.length - 1]
    const tieneFondo = ctx.fondos.has(cadena.identificacion)

    for (const hito of hitos) {
      if (maxAcum >= hito) {
        const idx = acumulados.findIndex((a) => a >= hito)
        const disparo = cadena.incapacidades[idx]
        const estimada = sumarDias(disparo.fechaHasta, -(disparo.diasAcumulados - hito))
        alertas.push({
          clave: `hito|${cadena.identificacion}|${cadena.id}|${hito}`,
          tipo: "hito",
          identificacion: cadena.identificacion,
          nombre: disparo.nombre,
          eps: disparo.eps,
          cadena: cadena.id,
          hito,
          diasAcumulados: maxAcum,
          fechaCumplimiento: estimada < disparo.fechaDesde ? disparo.fechaDesde : estimada,
          nroIncapacidad: disparo.nroIncapacidad,
          accionSugerida: accionHito(hito, tieneFondo),
        })
      } else if (maxAcum >= hito - ctx.params.diasAlertaPrevia) {
        alertas.push({
          clave: `previa|${cadena.identificacion}|${cadena.id}|${hito}`,
          tipo: "previa",
          identificacion: cadena.identificacion,
          nombre: ultima.nombre,
          eps: ultima.eps,
          cadena: cadena.id,
          hito,
          diasAcumulados: maxAcum,
          // Fecha estimada en que llegará al hito si la incapacidad continúa.
          fechaCumplimiento: sumarDias(ultima.fechaHasta, hito - ultima.diasAcumulados),
          nroIncapacidad: ultima.nroIncapacidad,
          accionSugerida: `Faltan ${hito - maxAcum} días para el día ${hito}. ${accionHito(hito, tieneFondo)}`,
        })
      }
    }
  }
  return alertas
}

// ─── PQRD ─────────────────────────────────────────────────────────────────────

export function fechaLimitePqrd(fechaRadicacion: FechaISO, params: ParametrosIncapacidades): FechaISO {
  return sumarDiasHabiles(fechaRadicacion, params.diasHabilesPqrd)
}

export function pqrdVencida(pqrd: Pick<Pqrd, "estado" | "fechaLimite">, corte: FechaISO): boolean {
  return pqrd.estado === "Abierta" && corte > pqrd.fechaLimite
}

// ─── Vistas derivadas ─────────────────────────────────────────────────────────

/** Fila calculada que consumen las vistas y el Resumen. */
export interface IncapacidadCalculada {
  inc: Incapacidad
  cobro: CobroCalculado
}

export interface FilaTransito {
  item: IncapacidadCalculada
  diasAcumulados: number
  diasPara180: number
  fechaDia120: FechaISO
  fechaDia150: FechaISO
  fechaDia180: FechaISO
  registroMasReciente: boolean
  estado: string
}

export interface CandidatoTransito {
  identificacion: string
  nombre: string
  diasAcumulados: number
  ultimaFechaHasta: FechaISO
  nrosSugeridos: string[]
}

/** Vista de accidentes de tránsito (hoja "Accidentes tránsito" del libro). */
export function vistaTransito(items: IncapacidadCalculada[], corte: FechaISO, params: ParametrosIncapacidades) {
  const transito = items.filter((x) => x.inc.tipo === TIPO.transito)

  const filas: FilaTransito[] = transito.map((item) => {
    const { inc } = item
    const propias = transito.filter((x) => x.inc.identificacion.trim() === inc.identificacion.trim())
    const suma = propias
      .filter((x) => x.inc.fechaDesde <= inc.fechaDesde)
      .reduce((s, x) => s + x.inc.dias, 0)
    const diasAcumulados = Math.max(suma, inc.diasAcumulados)
    const ultimaHasta = propias.reduce((m, x) => (x.inc.fechaHasta > m ? x.inc.fechaHasta : m), "")
    const registroMasReciente = inc.fechaHasta === ultimaHasta

    let estado: string
    if (!registroMasReciente) estado = "Histórico (ver registro más reciente)"
    else if (diasAcumulados >= 180) estado = "Superó 180 días: cobro pasa a la AFP (fondo de pensiones)"
    else if (diferenciaDias(corte, inc.fechaHasta) > 30) estado = "Sin prórroga hace más de 30 días: verificar cierre"
    else if (diasAcumulados >= 150) estado = "Día 150+: verificar remisión del caso a la AFP"
    else if (diasAcumulados >= 120) estado = "Día 120+: verificar concepto de rehabilitación"
    else if (diasAcumulados >= 90) estado = "Se acerca al día 120"
    else estado = "En seguimiento"

    return {
      item,
      diasAcumulados,
      diasPara180: Math.max(0, 180 - diasAcumulados),
      fechaDia120: sumarDias(inc.fechaHasta, 120 - diasAcumulados),
      fechaDia150: sumarDias(inc.fechaHasta, 150 - diasAcumulados),
      fechaDia180: sumarDias(inc.fechaHasta, 180 - diasAcumulados),
      registroMasReciente,
      estado,
    }
  })

  const indicadores = {
    colaboradores: filas.filter((f) => f.registroMasReciente).length,
    seAcercanA120: filas.filter((f) => f.estado.startsWith("Se acerca")).length,
    dia120: filas.filter((f) => f.estado.startsWith("Día 120")).length,
    dia150: filas.filter((f) => f.estado.startsWith("Día 150")).length,
    superaron180: filas.filter((f) => f.estado.startsWith("Superó")).length,
  }

  // Candidatos: diagnóstico de lesión (marcado en la carga) y 30+ días acumulados.
  const marcados = new Set(transito.map((x) => x.inc.identificacion.trim()))
  const porColaborador = new Map<string, Incapacidad[]>()
  for (const { inc } of items) {
    const id = inc.identificacion.trim()
    if (marcados.has(id) || !cuentaParaHitos(inc.tipo)) continue
    const lista = porColaborador.get(id) ?? []
    lista.push(inc)
    porColaborador.set(id, lista)
  }
  const candidatos: CandidatoTransito[] = []
  for (const [identificacion, lista] of porColaborador) {
    const sugeridas = lista.filter((i) => i.sugeridoTransito)
    if (sugeridas.length === 0) continue
    const ultima = [...lista].sort(ordenCronologico)[lista.length - 1]
    const dias = diasAcumuladosAlCorte(ultima, corte)
    if (dias < params.diasMinimosSugerenciaTransito) continue
    candidatos.push({
      identificacion,
      nombre: ultima.nombre,
      diasAcumulados: dias,
      ultimaFechaHasta: ultima.fechaHasta,
      nrosSugeridos: sugeridas.map((i) => i.nroIncapacidad),
    })
  }
  candidatos.sort((a, b) => b.diasAcumulados - a.diasAcumulados)

  return { filas, indicadores, candidatos }
}

export interface FilaMaternidad {
  item: IncapacidadCalculada
  fechaReintegro: FechaISO
  diasRestantes: number
  estado: "Por iniciar" | "En curso" | "En curso: reintegro próximo" | "Finalizada"
  finLactancia: FechaISO
}

/** Vista de licencias de maternidad (hoja "Licencias maternidad" del libro). */
export function vistaMaternidad(items: IncapacidadCalculada[], corte: FechaISO) {
  const filas: FilaMaternidad[] = items
    .filter((x) => x.inc.tipo === TIPO.maternidad)
    .map((item) => {
      const { fechaDesde, fechaHasta, finLactancia } = item.inc
      const referencia = corte > sumarDias(fechaDesde, -1) ? corte : sumarDias(fechaDesde, -1)
      let estado: FilaMaternidad["estado"]
      if (corte < fechaDesde) estado = "Por iniciar"
      else if (corte > fechaHasta) estado = "Finalizada"
      else if (diferenciaDias(fechaHasta, corte) <= 30) estado = "En curso: reintegro próximo"
      else estado = "En curso"
      return {
        item,
        fechaReintegro: sumarDias(fechaHasta, 1),
        diasRestantes: Math.max(0, diferenciaDias(fechaHasta, referencia)),
        estado,
        finLactancia: finLactancia ?? sumarMeses(fechaDesde, 6),
      }
    })

  const indicadores = {
    enCurso: filas.filter((f) => f.estado.startsWith("En curso")).length,
    reintegrosProximos: filas.filter((f) => f.estado === "En curso: reintegro próximo").length,
    porIniciar: filas.filter((f) => f.estado === "Por iniciar").length,
    saldoPorCobrar: filas.reduce((s, f) => s + f.item.cobro.saldo, 0),
    enMora: filas.filter((f) => f.item.cobro.alerta === "En mora").length,
  }
  return { filas, indicadores }
}

// ─── Resumen de cartera ───────────────────────────────────────────────────────

export interface FilaEntidad {
  entidad: string
  esFondo: boolean
  incapacidades: number
  valor: number
  pagado: number
  saldo: number
  recuperacion: number
  enMora: number
  riesgoPrescripcion: number
}

export interface FilaEstado {
  estado: string
  incapacidades: number
  valor: number
  saldo: number
}

const pct = (pagado: number, valor: number) => (valor === 0 ? 0 : pagado / valor)

export function resumenCartera(items: IncapacidadCalculada[], params: ParametrosIncapacidades) {
  const valor = items.reduce((s, x) => s + x.cobro.valor, 0)
  const pagado = items.reduce((s, x) => s + x.cobro.pagado, 0)
  const saldo = items.reduce((s, x) => s + x.cobro.saldo, 0)

  const contar = (a: AlertaCobro) => items.filter((x) => x.cobro.alerta === a)
  const pagoMenor = contar("Pago menor al valor")
  const conteos = {
    enMora: contar("En mora").length,
    riesgoPrescripcion: contar("Riesgo prescripción").length,
    rechazadasPorGestionar: contar("Rechazada: gestionar").length,
    pagoMenor: pagoMenor.length,
    saldoPagoMenor: pagoMenor.reduce((s, x) => s + x.cobro.saldo, 0),
  }

  // Por entidad de cobro (EPS y fondos): cada tramo suma a su entidad.
  const entidades = new Map<string, FilaEntidad>()
  const fila = (entidad: string, esFondo: boolean) => {
    let f = entidades.get(entidad)
    if (!f) {
      f = { entidad, esFondo, incapacidades: 0, valor: 0, pagado: 0, saldo: 0, recuperacion: 0, enMora: 0, riesgoPrescripcion: 0 }
      entidades.set(entidad, f)
    }
    return f
  }
  for (const e of params.listaEps) fila(e, false)
  for (const e of params.listaFondos) fila(e, true)
  for (const { cobro } of items) {
    for (const t of cobro.tramos) {
      const f = fila(t.entidad, t.tramo === "fondo")
      f.incapacidades++
      f.valor += t.valor
      f.pagado += t.pagado
      f.saldo += t.saldo
      if (cobro.alerta === "En mora") f.enMora++
      if (cobro.alerta === "Riesgo prescripción") f.riesgoPrescripcion++
    }
  }
  const porEntidad = [...entidades.values()].map((f) => ({ ...f, recuperacion: pct(f.pagado, f.valor) }))

  const estados = new Map<string, FilaEstado>()
  for (const e of params.listaEstados) estados.set(e, { estado: e, incapacidades: 0, valor: 0, saldo: 0 })
  for (const { inc, cobro } of items) {
    const f = estados.get(inc.estado) ?? { estado: inc.estado, incapacidades: 0, valor: 0, saldo: 0 }
    f.incapacidades++
    f.valor += cobro.valor
    f.saldo += cobro.saldo
    estados.set(inc.estado, f)
  }

  // Control: valor de entidades fuera de las listas (incluye fondo sin asignar). Debe ser 0.
  const enLista = new Set([...params.listaEps, ...params.listaFondos])
  const valorFueraDeLista = porEntidad.filter((f) => !enLista.has(f.entidad)).reduce((s, f) => s + f.valor, 0)

  // RNF-06: los cortes deben cuadrar con los totales.
  const inconsistencias: string[] = []
  const sum = <T,>(xs: T[], k: (x: T) => number) => xs.reduce((s, x) => s + k(x), 0)
  if (sum(porEntidad, (f) => f.valor) !== valor || sum(porEntidad, (f) => f.pagado) !== pagado) {
    inconsistencias.push("La tabla por entidad no cuadra con los totales")
  }
  const porEstado = [...estados.values()]
  if (sum(porEstado, (f) => f.valor) !== valor || sum(porEstado, (f) => f.saldo) !== saldo) {
    inconsistencias.push("La tabla por estado no cuadra con los totales")
  }

  return {
    totales: { valor, pagado, saldo, recuperacion: pct(pagado, valor), incapacidades: items.length },
    conteos,
    porEntidad,
    porEstado,
    valorFueraDeLista,
    inconsistencias,
  }
}

// ─── Helpers de carga ─────────────────────────────────────────────────────────

/** CIE-10 de lesiones y causas externas (S, T, V–Y): posible accidente de tránsito. */
export function esDiagnosticoLesion(codigo: string | null | undefined): boolean {
  return /^[STVWXY]/i.test((codigo ?? "").trim())
}
