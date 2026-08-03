"use client"

import { useEffect, useState } from "react"

/**
 * Estado sincronizado con `localStorage` bajo `key`. Arranca en `initial` (SSR-safe,
 * evita el flash de hidratación) y se hidrata en un efecto tras el montaje —mismo
 * patrón que `appearance-context.tsx`—; los cambios posteriores se persisten solos.
 *
 * `hydrated` es STATE (no ref): el flip a `true` viaja en el MISMO batch que el
 * `setValue` de la lectura, así que el efecto de persistencia solo corre una vez que
 * ambos ya aplicaron en el mismo render — nunca ve `value` viejo con `hydrated` nuevo.
 * Con un ref (versión anterior) el efecto de persistencia leía `value` de ESTE render
 * (aún el default) apenas el ref pasaba a `true`, y sobrescribía en el storage lo que el
 * efecto de lectura acababa de leer un instante antes — perdía el valor guardado en
 * cada montaje. React StrictMode (dev) lo hacía visible siempre al reinvocar los
 * efectos; sin StrictMode ocurría igual, solo que con menor probabilidad de notarlo.
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(false)
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // localStorage no disponible o dato corrupto: se mantiene el valor inicial.
    } finally {
      setHydrated(true)
    }
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // almacenamiento no disponible: ignorar
    }
  }, [key, value, hydrated])

  return [value, setValue] as const
}
