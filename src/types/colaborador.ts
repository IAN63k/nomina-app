/**
 * Colaborador del maestro compartido (tabla `colaboradores`): lo usan Recargos
 * (nombre → cédula), Vacaciones (cargo, sede) e Incapacidades (fondo de
 * pensiones). Sin salarios ni datos de salud.
 */
export interface Colaborador {
  /** Cédula, solo dígitos. */
  cedula: string
  nombre: string
  cargo?: string | null
  sede?: string | null
  fondoPensiones?: string | null
  activo?: boolean
}

/** Campos que acepta la importación desde Excel (lista blanca). */
export interface ColaboradorImportado {
  cedula: string
  nombre: string
  cargo: string | null
  sede: string | null
  /** Texto del archivo; el servidor lo convierte a un fondo de la lista o lo descarta. */
  fondoPensiones: string | null
}

export const CEDULA_VALIDA = /^[0-9]{3,15}$/
