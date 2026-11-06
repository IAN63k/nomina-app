/**
 * Validación de lo que llega a app/api/turnos/* y app/api/preferencias.
 * Listas blancas de campos y tipos: el navegador ya no habla directo con
 * Supabase, así que todo lo que se guarda pasa por aquí.
 */

export const MODULOS_TURNOS = ["medicos", "auxiliares"] as const
export type ModuloTurnos = (typeof MODULOS_TURNOS)[number]

export const esModulo = (m: string): m is ModuloTurnos => (MODULOS_TURNOS as readonly string[]).includes(m)

/** Filas por petición: el navegador guarda por lotes (Vercel limita el cuerpo a ~4,5 MB). */
export const MAX_FILAS_POR_LOTE = 2000

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }
const ok = <T,>(valor: T): Resultado<T> => ({ ok: true, valor })
const error = (e: string): { ok: false; error: string } => ({ ok: false, error: e })
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

const FECHA = /^\d{4}-\d{2}-\d{2}$/
// Acepta "6:00", "06:00" y "06:00:00" (el catálogo real tiene horas de un dígito).
const HORA = /^\d{1,2}:\d{2}(:\d{2})?$/

export interface FilaTurnoBD {
  medico: string
  documento: number | null
  fecha: string
  fecha_inicio: string
  turno_codigo: string
  entrada: string | null
  salida: string | null
  concepto: number
  horas: number
  horasrecargo: number
  diferencia: number
  dia: "D" | "H" | "S"
  mes: number
  dia_numero: number
  festivo?: boolean
}

function numero(v: unknown, campo: string, min: number, max: number, entero = false): Resultado<number> {
  if (typeof v !== "number" || !Number.isFinite(v)) return error(`${campo} debe ser un número`)
  if (entero && !Number.isInteger(v)) return error(`${campo} debe ser entero`)
  if (v < min || v > max) return error(`${campo} fuera de rango`)
  return ok(v)
}

function hora(v: unknown, campo: string): Resultado<string | null> {
  if (v === null || v === undefined || v === "") return ok(null)
  if (typeof v !== "string" || !HORA.test(v)) return error(`${campo} debe ser una hora HH:MM`)
  return ok(v)
}

/** Valida un lote de filas del modelo (`TurnoRow`) y lo convierte a columnas de BD. */
export function validarFilasTurnos(body: unknown, modulo: ModuloTurnos): Resultado<FilaTurnoBD[]> {
  if (!esObjeto(body) || !Array.isArray(body.filas)) return error("Faltan las filas")
  if (body.filas.length === 0) return error("No hay filas para guardar")
  if (body.filas.length > MAX_FILAS_POR_LOTE) return error(`Máximo ${MAX_FILAS_POR_LOTE} filas por lote`)

  const salida: FilaTurnoBD[] = []
  for (let i = 0; i < body.filas.length; i++) {
    const f = body.filas[i]
    const donde = `Fila ${i + 1}`
    if (!esObjeto(f)) return error(`${donde}: formato inválido`)

    if (typeof f.medico !== "string" || !f.medico.trim() || f.medico.length > 200) return error(`${donde}: nombre inválido`)
    if (f.documento !== null && f.documento !== undefined) {
      const d = numero(f.documento, `${donde}: documento`, 0, 1e15, true)
      if (!d.ok) return d
    }
    const fechaInicio = f.fechaInicio ?? f.fecha_inicio ?? f.fecha
    for (const [campo, v] of [["fecha", f.fecha], ["fechaInicio", fechaInicio]] as const) {
      if (typeof v !== "string" || !FECHA.test(v)) return error(`${donde}: ${campo} inválida`)
    }
    if (typeof f.turno_codigo !== "string" || f.turno_codigo.length > 20) return error(`${donde}: código de turno inválido`)
    const entrada = hora(f.entrada, `${donde}: entrada`)
    if (!entrada.ok) return entrada
    const sal = hora(f.salida, `${donde}: salida`)
    if (!sal.ok) return sal
    const nums = [
      numero(f.concepto, `${donde}: concepto`, 0, 999, true),
      numero(f.horas, `${donde}: horas`, -1000, 1000),
      numero(f.horasrecargo, `${donde}: horas de recargo`, -1000, 1000),
      numero(f.diferencia, `${donde}: diferencia`, -1000, 1000),
      numero(f.mes, `${donde}: mes`, 1, 12, true),
      numero(f.dia_numero, `${donde}: día`, 1, 31, true),
    ]
    const malo = nums.find((n) => !n.ok)
    if (malo && !malo.ok) return malo
    if (f.dia !== "D" && f.dia !== "H" && f.dia !== "S") return error(`${donde}: tipo de día inválido`)

    const fila: FilaTurnoBD = {
      medico: f.medico,
      documento: (f.documento as number | null | undefined) ?? null,
      fecha: f.fecha as string,
      fecha_inicio: fechaInicio as string,
      turno_codigo: f.turno_codigo,
      entrada: entrada.valor,
      salida: sal.valor,
      concepto: f.concepto as number,
      horas: f.horas as number,
      horasrecargo: f.horasrecargo as number,
      diferencia: f.diferencia as number,
      dia: f.dia,
      mes: f.mes as number,
      dia_numero: f.dia_numero as number,
    }
    // La tabla de médicos no tiene columna `festivo` (solo auxiliares).
    if (modulo === "auxiliares") fila.festivo = Boolean(f.festivo)
    salida.push(fila)
  }
  return ok(salida)
}

// ─── Catálogo de turnos personalizados ───────────────────────────────────────

const CODIGO = /^[A-Za-z0-9/_-]{1,20}$/

export function validarCodigoCatalogo(codigo: unknown): Resultado<string> {
  if (typeof codigo !== "string" || !CODIGO.test(codigo)) return error("Código de turno inválido")
  return ok(codigo)
}

export interface TurnoCatalogoBD {
  entrada: string
  salida: string
  total: string
  descripcion: string
}

export function validarTurnoCatalogo(body: unknown): Resultado<{ codigo: string; config: TurnoCatalogoBD }> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  const codigo = validarCodigoCatalogo(body.codigo)
  if (!codigo.ok) return codigo
  const c = body.config
  if (!esObjeto(c)) return error("Falta la configuración del turno")
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null)
  const entrada = texto(c.entrada, 8)
  const salida = texto(c.salida, 8)
  const total = texto(c.total, 10)
  const descripcion = texto(c.descripcion, 200)
  if (entrada === null || salida === null || total === null || descripcion === null) return error("Configuración del turno inválida")
  if ((entrada && !HORA.test(entrada)) || (salida && !HORA.test(salida))) return error("Entrada y salida deben ser horas HH:MM")
  if (total && !/^\d{1,2}([.,]\d{1,2})?$/.test(total)) return error("Total de horas inválido")
  return ok({ codigo: codigo.valor, config: { entrada, salida, total, descripcion } })
}

// ─── Preferencias del usuario ─────────────────────────────────────────────────

/** Claves de preferencia permitidas (hoy: columnas/paginación del detalle de Recargos). */
export const CLAVE_PREFERENCIA = /^recargos-detail:(medicos|auxiliares)$/
const MAX_PREFERENCIA_BYTES = 8 * 1024

export function validarPreferencia(body: unknown): Resultado<{ clave: string; valor: Record<string, unknown> }> {
  if (!esObjeto(body)) return error("Cuerpo inválido")
  if (typeof body.clave !== "string" || !CLAVE_PREFERENCIA.test(body.clave)) return error("Clave de preferencia no permitida")
  if (!esObjeto(body.valor)) return error("El valor debe ser un objeto")
  if (JSON.stringify(body.valor).length > MAX_PREFERENCIA_BYTES) return error("Preferencia demasiado grande")
  return ok({ clave: body.clave, valor: body.valor })
}
