/**
 * Preferencias de usuario por módulo, persistidas en Supabase
 * (tabla `user_preferences`: usuario, clave, valor jsonb) vía
 * app/api/preferencias, que usa el usuario de la SESIÓN FIRMADA (nadie puede
 * leer ni cambiar las de otro).
 * Sin sesión —o si Supabase falla— se usa localStorage como
 * respaldo, y lo guardado allí se migra a la tabla en la primera lectura
 * con sesión activa.
 */

import { apiJson } from "@/src/lib/apiCliente"
import type { ShiftModule } from "@/src/constants/shiftColors"

export type RecargosDetailPrefs = {
  /** Visibilidad de columnas de la tabla de detalle (key de columna → visible). */
  visibleCols: Record<string, boolean>
  /** Mostrar también los días sin recargo (ocultos por defecto). */
  showSinRecargo: boolean
  /** Filas por página. */
  pageSize: number
}

const detailClave = (module: ShiftModule) => `recargos-detail:${module}`
const detailKey = (module: ShiftModule) => `nomina:prefs:recargos-detail:${module}`
/** Clave anterior donde solo se guardaba la visibilidad de columnas. */
const legacyColsKey = (module: ShiftModule) => `nomina:recargos:detail-cols:${module}`

function currentUsuario(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem("auth_user")
    if (!raw) return null
    const user = JSON.parse(raw)
    return typeof user?.usuario === "string" && user.usuario ? user.usuario : null
  } catch {
    return null
  }
}

function loadFromLocalStorage(module: ShiftModule): Partial<RecargosDetailPrefs> | null {
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

function saveToLocalStorage(module: ShiftModule, prefs: RecargosDetailPrefs): void {
  try {
    window.localStorage.setItem(detailKey(module), JSON.stringify(prefs))
  } catch {
    // localStorage no disponible: la preferencia vive solo en la sesión.
  }
}

// Las preferencias no deben cerrar la sesión si fallan: caen a localStorage.
async function upsertPrefs(clave: string, valor: Partial<RecargosDetailPrefs>): Promise<void> {
  await apiJson("/api/preferencias", { method: "PUT", body: { clave, valor }, avisarSesion: false })
}

export async function loadRecargosDetailPrefs(
  module: ShiftModule
): Promise<Partial<RecargosDetailPrefs> | null> {
  if (typeof window === "undefined") return null

  const usuario = currentUsuario()
  if (!usuario) return loadFromLocalStorage(module)

  try {
    const data = await apiJson<{ valor: unknown }>(
      `/api/preferencias?clave=${encodeURIComponent(detailClave(module))}`,
      { avisarSesion: false },
    )

    if (data?.valor && typeof data.valor === "object") {
      return data.valor as Partial<RecargosDetailPrefs>
    }

    // Sin fila en la tabla: migrar lo que hubiera en localStorage.
    const local = loadFromLocalStorage(module)
    if (local) {
      upsertPrefs(detailClave(module), local).catch(() => {})
    }
    return local
  } catch {
    return loadFromLocalStorage(module)
  }
}

export async function saveRecargosDetailPrefs(
  module: ShiftModule,
  prefs: RecargosDetailPrefs
): Promise<void> {
  if (typeof window === "undefined") return

  const usuario = currentUsuario()
  if (!usuario) {
    saveToLocalStorage(module, prefs)
    return
  }

  try {
    await upsertPrefs(detailClave(module), prefs)
  } catch {
    // Supabase no disponible: conservar al menos en este navegador.
    saveToLocalStorage(module, prefs)
  }
}
