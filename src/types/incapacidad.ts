/**
 * Tipos del módulo de Incapacidades.
 *
 * Fechas: siempre texto ISO "YYYY-MM-DD" (fecha civil, sin hora ni zona) para
 * que nada se corra un día entre navegador, servidor (UTC) y Bogotá.
 * Valores: pesos enteros.
 */

export type FechaISO = string

export type Tramo = "eps" | "fondo"

/** Una incapacidad tal como se guarda (datos de KactuS + seguimiento digitado). */
export interface Incapacidad {
  id?: string
  identificacion: string
  nroIncapacidad: string
  nombre: string
  concepto: number | null
  tipo: string
  esProrroga: boolean
  dias: number
  diasAcumulados: number
  fechaDesde: FechaISO
  fechaHasta: FechaISO
  fechaRadicacionNomina: FechaISO | null
  fechaRadicacionEps: FechaISO | null
  valorIncapacidad: number
  /** Nombre corto de la lista de EPS (o ARL). */
  eps: string | null
  /** Valor del tramo del fondo digitado por nómina; null = proporcional a los días. */
  valorFondoManual: number | null
  estado: string
  causalNoPago: string | null
  responsable: string | null
  observacion: string | null
  finLactancia: FechaISO | null
  sugeridoTransito: boolean
  paraRevisar: string[]
  origen: string | null
}

export interface Pago {
  id?: string
  incapacidadId: string
  tramo: Tramo
  fechaPago: FechaISO
  valor: number
  observacion?: string | null
  anulado: boolean
}

export interface Pqrd {
  id?: string
  incapacidadId: string
  radicado: string
  entidad: string
  fechaRadicacion: FechaISO
  motivo: string
  fechaLimite: FechaISO
  estado: "Abierta" | "Respondida a favor" | "Respondida en contra"
}

export interface ParametrosIncapacidades {
  /** null = hoy en America/Bogota. */
  fechaCorte: FechaISO | null
  diasMora: number
  mesesPrescripcion: number
  mesesAnticipacionPrescripcion: number
  toleranciaRedondeo: number
  diasHabilesPqrd: number
  hitosDias: number[]
  diasAlertaPrevia: number
  diasMinimosSugerenciaTransito: number
  correosAlertas: string[]
  listaEps: string[]
  listaFondos: string[]
  listaEstados: string[]
  listaCausales: string[]
  listaTipos: string[]
}

export const PARAMETROS_POR_DEFECTO: ParametrosIncapacidades = {
  fechaCorte: null,
  diasMora: 60,
  mesesPrescripcion: 36,
  mesesAnticipacionPrescripcion: 6,
  toleranciaRedondeo: 1000,
  diasHabilesPqrd: 15,
  hitosDias: [90, 120, 150, 180],
  diasAlertaPrevia: 15,
  diasMinimosSugerenciaTransito: 30,
  correosAlertas: ["auxiliarcompensacionsalarial@sos.com.co", "mvramirez@sos.com.co"],
  listaEps: [
    "SOS", "Sanitas", "Sura", "Coosalud", "Nueva EPS", "Salud Total", "Comfenalco Valle",
    "Compensar", "Coomeva", "Famisanar", "Mutual Ser", "Colmena ARL", "Emssanar", "Mallamas EPSI",
  ],
  listaFondos: ["Colpensiones", "Porvenir", "Protección", "Colfondos", "Skandia"],
  listaEstados: [
    "Radicada", "En trámite", "Pagada parcial", "Pagada", "Rechazada", "Prescrita", "Castigada", "Sin subsidio",
  ],
  listaCausales: [
    "IPS no adscrita a la red",
    "IPS no adscrita y sin justificación de ausencia ante la EPS",
    "No cumple mínimo de semanas de cotización",
    "Diferencia de cotización por salario integral",
    "Pago proporcional a periodos cotizados",
    "Dictamen de pensión",
    "Traslape de fechas con otra cobertura",
    "Prescrita",
    "Incapacidad superior a 180 días",
    "Concepto de rehabilitación no favorable",
    "Otra",
  ],
  listaTipos: [
    "Enfermedad general", "Licencia de maternidad", "Licencia de paternidad",
    "Accidente de trabajo", "Accidente de tránsito", "Enfermedad laboral",
  ],
}

export const TIPO = {
  enfermedadGeneral: "Enfermedad general",
  maternidad: "Licencia de maternidad",
  paternidad: "Licencia de paternidad",
  accidenteTrabajo: "Accidente de trabajo",
  transito: "Accidente de tránsito",
  enfermedadLaboral: "Enfermedad laboral",
} as const

export const ESTADO = {
  radicada: "Radicada",
  enTramite: "En trámite",
  pagadaParcial: "Pagada parcial",
  pagada: "Pagada",
  rechazada: "Rechazada",
  prescrita: "Prescrita",
  castigada: "Castigada",
  sinSubsidio: "Sin subsidio",
} as const

export type AlertaCobro =
  | "Cerrada"
  | "Riesgo prescripción"
  | "Rechazada: gestionar"
  | "Pago menor al valor"
  | "En mora"
  | "Al día"

/** Una porción del cobro de la incapacidad ante una entidad. */
export interface TramoCobro {
  tramo: Tramo
  /** EPS/ARL o fondo de pensiones; "Fondo de pensiones (sin asignar)" si falta. */
  entidad: string
  dias: number
  valor: number
  pagado: number
  saldo: number
}

/** Seguimiento calculado de una incapacidad (lo que muestran tabla, Resumen y exportación). */
export interface CobroCalculado {
  tramos: TramoCobro[]
  valor: number
  pagado: number
  saldo: number
  fechaUltimoPago: FechaISO | null
  diasDesdeRadicacion: number | null
  fechaPrescripcion: FechaISO
  alerta: AlertaCobro
  avisos: string[]
}

export type TipoAlertaDias = "hito" | "previa"

export interface AlertaDias {
  clave: string
  tipo: TipoAlertaDias
  identificacion: string
  nombre: string
  eps: string | null
  cadena: string
  hito: number
  diasAcumulados: number
  fechaCumplimiento: FechaISO
  nroIncapacidad: string
  accionSugerida: string
}
