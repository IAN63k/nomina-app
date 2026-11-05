/**
 * Lectura del reporte "KactuS - KNmIncap" (.xlsx) y vista previa de la carga.
 *
 * Flujo: leerKactus() → filas validadas (o rechazadas con motivo) →
 * prepararCarga() contra lo ya registrado → nuevas / duplicadas / rechazadas /
 * para revisar. La carga NUNCA modifica lo ya gestionado: las duplicadas solo
 * se informan.
 *
 * Datos de salud (RNF-01): el Diagnóstico se lee solo para marcar
 * `sugeridoTransito` y se descarta; no aparece en ningún objeto que salga de
 * este módulo.
 */

import * as XLSX from "xlsx"
import { diasFondo, esDiagnosticoLesion, llaveIncapacidad } from "@/src/services/incapacidadesEngine"
import { ESTADO, TIPO, type FechaISO, type Incapacidad, type ParametrosIncapacidades } from "@/src/types/incapacidad"

// ─── Columnas ─────────────────────────────────────────────────────────────────

export const COLUMNAS_KACTUS = {
  identificacion: "Identificación",
  nombres: "Nombres",
  apellidos: "Apellidos",
  nro: "Nro. Incapacidad",
  concepto: "Concepto",
  nombreConcepto: "Nombre Concepto",
  prorrogada: "Nro. Incapacidad Prorrogada",
  dias: "Número Días",
  diasTotales: "Días Totales",
  fechaDesde: "Fecha Desde",
  fechaHasta: "Fecha Hasta",
  fechaRadicacion: "Fecha Radicación",
  valor: "Valor incapacidad",
  entidad: "Nombre Entidad",
  diagnostico: "Diagnóstico",
  finLactancia: "Fecha Final de Lactancia",
  observaciones: "Observaciones",
} as const

type CampoKactus = keyof typeof COLUMNAS_KACTUS

const normalizarEncabezado = (s: unknown) =>
  String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase()

// ─── Conversión de valores ────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0")

/** Fecha de Excel → ISO. Con cellDates:true llegan Date en hora local (getters locales = día correcto). */
export function aFechaISO(v: unknown): FechaISO | null {
  if (v === null || v === undefined || v === "") return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime()) || v.getFullYear() < 1900) return null
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v)
    return d && d.y >= 1900 ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null
  }
  const s = String(v).trim()
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

export function aTexto(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$\s.]/g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

// ─── EPS y tipo ───────────────────────────────────────────────────────────────

const normalizarEntidad = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const PALABRAS_GENERICAS = new Set(["eps", "epsi", "arl", "sa", "s", "a"])

/** Nombres de KactuS que no se reconocen por contenido. */
const ALIAS_ENTIDAD: Record<string, string> = {
  "colmena seguros riesgos laborales": "Colmena ARL",
}

/**
 * "Nombre Entidad" de KactuS → nombre corto de la lista de EPS.
 * Ej. "SERVICIOS OCCIDENTAL DE SALUD S.A S.O.S" → "SOS". null si no hay una
 * coincidencia única (la carga pide asignarla).
 */
export function normalizarEps(nombreEntidad: string, listaEps: string[]): string | null {
  const ent = normalizarEntidad(nombreEntidad)
  if (!ent) return null
  const directo = listaEps.find((e) => normalizarEntidad(e) === ent)
  if (directo) return directo
  const alias = ALIAS_ENTIDAD[ent]
  if (alias && listaEps.includes(alias)) return alias

  const palabras = ` ${ent} `
  const coincidencias = listaEps.filter((e) => {
    const nucleo = normalizarEntidad(e)
      .split(" ")
      .filter((p) => !PALABRAS_GENERICAS.has(p))
      .join(" ")
    return nucleo.length > 0 && palabras.includes(` ${nucleo} `)
  })
  return coincidencias.length === 1 ? coincidencias[0] : null
}

const TIPO_POR_CONCEPTO: Record<number, string> = {
  121: TIPO.enfermedadGeneral,
  122: TIPO.maternidad,
  123: TIPO.paternidad,
  124: TIPO.accidenteTrabajo,
}

// ─── Lectura del archivo ──────────────────────────────────────────────────────

export interface FilaKactus {
  /** Número de fila en Excel (1 = encabezados). */
  fila: number
  identificacion: string
  nombre: string
  nroIncapacidad: string
  concepto: number | null
  tipo: string
  conceptoDesconocido: boolean
  esProrroga: boolean
  dias: number
  diasAcumulados: number
  fechaDesde: FechaISO
  fechaHasta: FechaISO
  fechaRadicacionNomina: FechaISO | null
  valorIncapacidad: number
  entidadKactus: string
  eps: string | null
  finLactancia: FechaISO | null
  observacion: string | null
  sugeridoTransito: boolean
}

export interface FilaRechazada {
  fila: number
  identificacion: string
  nroIncapacidad: string
  motivo: string
}

export type ResultadoLectura =
  | { ok: true; hoja: string; filas: FilaKactus[]; rechazadas: FilaRechazada[] }
  | { ok: false; error: string; columnasFaltantes?: string[] }

export function leerKactus(
  data: ArrayBuffer | Uint8Array,
  nombreArchivo: string,
  params: Pick<ParametrosIncapacidades, "listaEps">,
): ResultadoLectura {
  if (!/\.xlsx$/i.test(nombreArchivo.trim())) {
    return { ok: false, error: "El archivo debe ser .xlsx (reporte KactuS - KNmIncap)." }
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(data, { type: "array", cellDates: true })
  } catch {
    return { ok: false, error: "No se pudo leer el archivo: no parece un Excel válido." }
  }
  const hoja = wb.SheetNames[0]
  if (!hoja) return { ok: false, error: "El archivo no tiene hojas." }

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, defval: null, raw: true })
  const encabezados = (matriz[0] ?? []).map(normalizarEncabezado)

  const indice = {} as Record<CampoKactus, number>
  const faltantes: string[] = []
  for (const [campo, titulo] of Object.entries(COLUMNAS_KACTUS) as [CampoKactus, string][]) {
    const i = encabezados.indexOf(normalizarEncabezado(titulo))
    if (i === -1) faltantes.push(titulo)
    indice[campo] = i
  }
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: `Al archivo le faltan columnas: ${faltantes.join(", ")}.`,
      columnasFaltantes: faltantes,
    }
  }

  const filas: FilaKactus[] = []
  const rechazadas: FilaRechazada[] = []

  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r] ?? []
    const celda = (c: CampoKactus) => row[indice[c]]
    if (row.every((v) => v === null || v === "")) continue

    const fila = r + 1
    const identificacion = aTexto(celda("identificacion"))
    const nroIncapacidad = aTexto(celda("nro"))
    const fechaDesde = aFechaISO(celda("fechaDesde"))
    const fechaHasta = aFechaISO(celda("fechaHasta"))

    const rechazar = (motivo: string) => rechazadas.push({ fila, identificacion, nroIncapacidad, motivo })
    if (!identificacion) { rechazar("Sin Identificación"); continue }
    if (!nroIncapacidad) { rechazar("Sin Nº de incapacidad"); continue }
    if (!fechaDesde || !fechaHasta) { rechazar("Sin Fecha desde o Fecha hasta"); continue }
    if (fechaHasta < fechaDesde) { rechazar("Fecha hasta anterior a Fecha desde"); continue }

    const concepto = aNumero(celda("concepto"))
    const tipoConcepto = concepto !== null ? TIPO_POR_CONCEPTO[concepto] : undefined
    const tipo = tipoConcepto ?? TIPO.enfermedadGeneral
    const dias = aNumero(celda("dias")) ?? 0
    const entidadKactus = aTexto(celda("entidad"))

    filas.push({
      fila,
      identificacion,
      nombre: [aTexto(celda("nombres")), aTexto(celda("apellidos"))].filter(Boolean).join(" "),
      nroIncapacidad,
      concepto,
      tipo,
      conceptoDesconocido: tipoConcepto === undefined,
      esProrroga: aTexto(celda("prorrogada")) !== "",
      dias,
      diasAcumulados: aNumero(celda("diasTotales")) ?? dias,
      fechaDesde,
      fechaHasta,
      fechaRadicacionNomina: aFechaISO(celda("fechaRadicacion")),
      valorIncapacidad: Math.round(aNumero(celda("valor")) ?? 0),
      entidadKactus,
      eps: normalizarEps(entidadKactus, params.listaEps),
      finLactancia: tipo === TIPO.maternidad ? aFechaISO(celda("finLactancia")) : null,
      observacion: aTexto(celda("observaciones")) || null,
      // El diagnóstico se usa aquí y se descarta (RNF-01).
      sugeridoTransito: esDiagnosticoLesion(aTexto(celda("diagnostico"))),
    })
  }

  return { ok: true, hoja, filas, rechazadas }
}

// ─── Vista previa de la carga ─────────────────────────────────────────────────

export interface RegistroExistente {
  identificacion: string
  nroIncapacidad: string
  fechaRadicacionNomina: FechaISO | null
}

export interface FilaDuplicada {
  fila: number
  identificacion: string
  nombre: string
  nroIncapacidad: string
  /** "registrada" = ya está en Seguimiento; "archivo" = repetida en el mismo archivo. */
  contra: "registrada" | "archivo"
}

export interface FilaParaRevisar {
  fila: number
  identificacion: string
  nombre: string
  nroIncapacidad: string
  motivos: string[]
  /** true = una de las nuevas (se guarda con la marca); false = duplicada (solo aviso). */
  esNueva: boolean
}

export interface VistaPreviaCarga {
  nuevas: Incapacidad[]
  duplicadas: FilaDuplicada[]
  rechazadas: FilaRechazada[]
  paraRevisar: FilaParaRevisar[]
  /** Nuevas cuya entidad no está en la lista: asignar EPS antes de guardar. */
  sinEps: { fila: number; nroIncapacidad: string; entidadKactus: string }[]
  /** Colaboradores con cobro al fondo y sin fondo registrado: pedirlo antes de guardar. */
  sinFondo: { identificacion: string; nombre: string }[]
}

export const MOTIVO = {
  valorCero: "Valor incapacidad en $0",
  fondoValorCero: "Más de 180 días con valor $0: falta digitar el valor a cobrar al fondo de pensiones",
  fondo: "Supera 180 días: se cobra al fondo de pensiones (verificar fondo y valor)",
  sinEps: "La entidad no está en la lista de EPS: asignarla antes de guardar",
  conceptoDesconocido: "Concepto de KactuS desconocido: revisar el tipo de incapacidad",
  radicacionDistinta: (registrada: string | null, archivo: string | null) =>
    `Duplicada con Fecha radicación nómina distinta (registrada ${registrada ?? "vacía"}, archivo ${archivo ?? "vacía"})`,
} as const

/**
 * Compara las filas leídas contra lo registrado (y contra sí mismas) y arma la
 * vista previa. No guarda nada.
 */
export function prepararCarga(
  lectura: { filas: FilaKactus[]; rechazadas: FilaRechazada[] },
  existentes: RegistroExistente[],
  fondos: Map<string, string>,
  origen: string,
): VistaPreviaCarga {
  const registradas = new Map(existentes.map((e) => [llaveIncapacidad(e.identificacion, e.nroIncapacidad), e]))
  const vistas = new Set<string>()

  const vista: VistaPreviaCarga = {
    nuevas: [],
    duplicadas: [],
    rechazadas: [...lectura.rechazadas],
    paraRevisar: [],
    sinEps: [],
    sinFondo: [],
  }
  const sinFondo = new Map<string, string>()

  for (const f of lectura.filas) {
    const llave = llaveIncapacidad(f.identificacion, f.nroIncapacidad)
    const base = { fila: f.fila, identificacion: f.identificacion, nombre: f.nombre, nroIncapacidad: f.nroIncapacidad }

    const previa = registradas.get(llave)
    if (previa) {
      vista.duplicadas.push({ ...base, contra: "registrada" })
      if ((previa.fechaRadicacionNomina ?? null) !== f.fechaRadicacionNomina) {
        vista.paraRevisar.push({
          ...base,
          esNueva: false,
          motivos: [MOTIVO.radicacionDistinta(previa.fechaRadicacionNomina, f.fechaRadicacionNomina)],
        })
      }
      continue
    }
    if (vistas.has(llave)) {
      vista.duplicadas.push({ ...base, contra: "archivo" })
      continue
    }
    vistas.add(llave)

    const motivos: string[] = []
    const enFondo = diasFondo(f) > 0
    if (f.valorIncapacidad === 0) motivos.push(enFondo ? MOTIVO.fondoValorCero : MOTIVO.valorCero)
    else if (enFondo) motivos.push(MOTIVO.fondo)
    if (!f.eps) {
      motivos.push(MOTIVO.sinEps)
      vista.sinEps.push({ fila: f.fila, nroIncapacidad: f.nroIncapacidad, entidadKactus: f.entidadKactus })
    }
    if (f.conceptoDesconocido) motivos.push(MOTIVO.conceptoDesconocido)
    if (enFondo && !fondos.has(f.identificacion)) sinFondo.set(f.identificacion, f.nombre)

    vista.nuevas.push({
      identificacion: f.identificacion,
      nroIncapacidad: f.nroIncapacidad,
      nombre: f.nombre,
      concepto: f.concepto,
      tipo: f.tipo,
      esProrroga: f.esProrroga,
      dias: f.dias,
      diasAcumulados: f.diasAcumulados,
      fechaDesde: f.fechaDesde,
      fechaHasta: f.fechaHasta,
      fechaRadicacionNomina: f.fechaRadicacionNomina,
      fechaRadicacionEps: null,
      valorIncapacidad: f.valorIncapacidad,
      eps: f.eps,
      valorFondoManual: null,
      estado: ESTADO.radicada,
      causalNoPago: null,
      responsable: null,
      observacion: f.observacion,
      finLactancia: f.finLactancia,
      sugeridoTransito: f.sugeridoTransito,
      paraRevisar: motivos,
      origen,
    })
    if (motivos.length > 0) vista.paraRevisar.push({ ...base, esNueva: true, motivos })
  }

  vista.sinFondo = [...sinFondo].map(([identificacion, nombre]) => ({ identificacion, nombre }))
  return vista
}
