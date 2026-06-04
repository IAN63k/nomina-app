/**
 * festivosColombia — Calendario de festivos de Colombia (puro, memoizado por año).
 *
 * Cubre los tres tipos de festivo oficiales:
 *  - Fijos: caen siempre en la misma fecha.
 *  - Ley Emiliani (Ley 51 de 1983): se trasladan al lunes siguiente.
 *  - Basados en la Pascua: se calculan desde el Domingo de Resurrección (Computus).
 *
 * `isFestivoColombia` se usa como fuente central de festivos del motor de recargos:
 * dispara la jornada semanal reducida (37h) y la clasificación festiva (conceptos
 * 33/34 de hora extra y 35/39 de recargo dominical).
 */

const dateOnlyKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Traslada un festivo al lunes siguiente si no cae ya en lunes (Ley Emiliani). */
const toNextMonday = (date: Date) => {
  const day = date.getDay() // 0=domingo … 1=lunes
  if (day === 1) return date
  const offset = day === 0 ? 1 : 8 - day
  return addDays(date, offset)
}

/** Domingo de Resurrección por el algoritmo de Gauss/Computus (calendario gregoriano). */
const easterSunday = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const buildHolidaySet = (year: number): Set<string> => {
  const set = new Set<string>()
  const add = (date: Date) => set.add(dateOnlyKey(date))

  // Fijos
  add(new Date(year, 0, 1)) // Año Nuevo
  add(new Date(year, 4, 1)) // Día del Trabajo
  add(new Date(year, 6, 20)) // Independencia
  add(new Date(year, 7, 7)) // Batalla de Boyacá
  add(new Date(year, 11, 8)) // Inmaculada Concepción
  add(new Date(year, 11, 25)) // Navidad

  // Ley Emiliani — se trasladan al lunes siguiente
  add(toNextMonday(new Date(year, 0, 6))) // Reyes Magos
  add(toNextMonday(new Date(year, 2, 19))) // San José
  add(toNextMonday(new Date(year, 5, 29))) // San Pedro y San Pablo
  add(toNextMonday(new Date(year, 7, 15))) // Asunción de la Virgen
  add(toNextMonday(new Date(year, 9, 12))) // Día de la Raza
  add(toNextMonday(new Date(year, 10, 1))) // Todos los Santos
  add(toNextMonday(new Date(year, 10, 11))) // Independencia de Cartagena

  // Basados en la Pascua
  const easter = easterSunday(year)
  add(addDays(easter, -3)) // Jueves Santo
  add(addDays(easter, -2)) // Viernes Santo
  add(toNextMonday(addDays(easter, 39))) // Ascensión del Señor
  add(toNextMonday(addDays(easter, 60))) // Corpus Christi
  add(toNextMonday(addDays(easter, 68))) // Sagrado Corazón

  return set
}

const cacheByYear = new Map<number, Set<string>>()

const holidaySetFor = (year: number): Set<string> => {
  let set = cacheByYear.get(year)
  if (!set) {
    set = buildHolidaySet(year)
    cacheByYear.set(year, set)
  }
  return set
}

/** True si `date` es festivo oficial en Colombia (no incluye domingos). */
export const isFestivoColombia = (date: Date): boolean =>
  holidaySetFor(date.getFullYear()).has(dateOnlyKey(date))
