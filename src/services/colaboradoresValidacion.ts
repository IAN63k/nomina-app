/**
 * Validación de lo que llega a app/api/colaboradores/* (no se confía en el
 * navegador). Lista blanca de campos: cualquier otro dato (p. ej. salario)
 * se descarta aquí aunque el cliente lo envíe.
 */

import { CEDULA_VALIDA, type ColaboradorImportado } from "@/src/types/colaborador"

export const MAX_COLABORADORES = 20_000
const MAX_TEXTO = 200

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

const esTexto = (v: unknown): v is string => typeof v === "string"

function textoOpcional(v: unknown, campo: string): Resultado<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null }
  if (!esTexto(v)) return { ok: false, error: `${campo} debe ser texto` }
  const t = v.trim().replace(/\s+/g, " ")
  if (t.length > MAX_TEXTO) return { ok: false, error: `${campo} supera ${MAX_TEXTO} caracteres` }
  return { ok: true, valor: t || null }
}

const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/**
 * Texto de fondo del archivo → nombre de la lista ("PROTECCION" → "Protección",
 * "SKANDIA FONDO DE PENSIONES OBLIGATORIAS" → "Skandia"). null si no hay una
 * coincidencia única.
 */
export function normalizarFondo(texto: string | null, fondosValidos: string[]): string | null {
  if (!texto) return null
  const t = ` ${sinTildes(texto)} `
  const coincidencias = fondosValidos.filter((f) => t.includes(` ${sinTildes(f)} `))
  return coincidencias.length === 1 ? coincidencias[0] : null
}

export interface Importacion {
  archivo: string | null
  colaboradores: ColaboradorImportado[]
  /** Textos de fondo que no corresponden a ningún fondo de la lista (se ignoran). */
  fondosNoReconocidos: string[]
}

export function validarImportacion(body: unknown, fondosValidos: string[]): Resultado<Importacion> {
  if (!body || typeof body !== "object") return { ok: false, error: "Cuerpo inválido" }
  const { archivo, colaboradores } = body as Record<string, unknown>
  if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
    return { ok: false, error: "No hay colaboradores para importar" }
  }
  if (colaboradores.length > MAX_COLABORADORES) {
    return { ok: false, error: `Máximo ${MAX_COLABORADORES} colaboradores por archivo` }
  }
  const nombreArchivo = textoOpcional(archivo, "archivo")
  if (!nombreArchivo.ok) return nombreArchivo

  const porCedula = new Map<string, ColaboradorImportado>()
  const noReconocidos = new Set<string>()
  for (let i = 0; i < colaboradores.length; i++) {
    const c = colaboradores[i] as Record<string, unknown>
    const fila = `colaborador ${i + 1}`
    const cedula = esTexto(c?.cedula) ? c.cedula.replace(/\D/g, "") : ""
    if (!CEDULA_VALIDA.test(cedula)) return { ok: false, error: `${fila}: cédula inválida` }
    const nombre = textoOpcional(c.nombre, `${fila}: nombre`)
    if (!nombre.ok) return nombre
    if (!nombre.valor) return { ok: false, error: `${fila}: sin nombre` }
    const cargo = textoOpcional(c.cargo, `${fila}: cargo`)
    if (!cargo.ok) return cargo
    const sede = textoOpcional(c.sede, `${fila}: sede`)
    if (!sede.ok) return sede
    const fondoTexto = textoOpcional(c.fondoPensiones, `${fila}: fondo de pensiones`)
    if (!fondoTexto.ok) return fondoTexto
    const fondo = normalizarFondo(fondoTexto.valor, fondosValidos)
    if (fondoTexto.valor && !fondo) noReconocidos.add(fondoTexto.valor)
    porCedula.set(cedula, { cedula, nombre: nombre.valor, cargo: cargo.valor, sede: sede.valor, fondoPensiones: fondo })
  }
  return {
    ok: true,
    valor: { archivo: nombreArchivo.valor, colaboradores: [...porCedula.values()], fondosNoReconocidos: [...noReconocidos] },
  }
}

export interface EdicionColaborador {
  cargo?: string | null
  sede?: string | null
  fondo_pensiones?: string | null
  activo?: boolean
}

/** Campos editables a mano. El fondo debe estar en la lista de fondos (o null para quitarlo). */
export function validarEdicion(body: unknown, fondosValidos: string[]): Resultado<EdicionColaborador> {
  if (!body || typeof body !== "object") return { ok: false, error: "Cuerpo inválido" }
  const b = body as Record<string, unknown>
  const cambios: EdicionColaborador = {}

  for (const campo of ["cargo", "sede"] as const) {
    if (campo in b) {
      const r = textoOpcional(b[campo], campo)
      if (!r.ok) return r
      cambios[campo] = r.valor
    }
  }
  if ("fondoPensiones" in b) {
    const r = textoOpcional(b.fondoPensiones, "fondo de pensiones")
    if (!r.ok) return r
    if (r.valor !== null && !fondosValidos.includes(r.valor)) {
      return { ok: false, error: `Fondo de pensiones no válido. Opciones: ${fondosValidos.join(", ")}` }
    }
    cambios.fondo_pensiones = r.valor
  }
  if ("activo" in b) {
    if (typeof b.activo !== "boolean") return { ok: false, error: "activo debe ser verdadero o falso" }
    cambios.activo = b.activo
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: "No hay cambios" }
  return { ok: true, valor: cambios }
}
