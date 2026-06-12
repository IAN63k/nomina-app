/**
 * Preferencias de usuario por módulo.
 *
 * Hoy persisten en localStorage, pero la API es asíncrona a propósito: cuando
 * se migre a Supabase (tabla de preferencias por usuario) solo cambia este
 * archivo; la UI ya consume promesas y muestra estados de carga.
 */

import type { ShiftModule } from "@/src/constants/shiftColors"

export type RecargosDetailPrefs = {
  /** Visibilidad de columnas de la tabla de detalle (key de columna → visible). */
  visibleCols: Record<string, boolean>
  /** Mostrar también los días sin recargo (ocultos por defecto). */
  showSinRecargo: boolean
  /** Filas por página. */
  pageSize: number
}

const detailKey = (module: ShiftModule) => `nomina:prefs:recargos-detail:${module}`
/** Clave anterior donde solo se guardaba la visibilidad de columnas. */
const legacyColsKey = (module: ShiftModule) => `nomina:recargos:detail-cols:${module}`

export async function loadRecargosDetailPrefs(
  module: ShiftModule
): Promise<Partial<RecargosDetailPrefs> | null> {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(detailKey(module))
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? parsed : null
    }
    // Migración desde la clave antigua (solo columnas).
    const legacy = window.localStorage.getItem(legacyColsKey(module))
    if (legacy) {
      const cols = JSON.parse(legacy)
      return cols && typeof cols === "object" ? { visibleCols: cols } : null
    }
    return null
  } catch {
    return null
  }
}

export async function saveRecargosDetailPrefs(
  module: ShiftModule,
  prefs: RecargosDetailPrefs
): Promise<void> {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(detailKey(module), JSON.stringify(prefs))
  } catch {
    // localStorage no disponible: la preferencia vive solo en la sesión.
  }
}
