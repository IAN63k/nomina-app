/**
 * recargoEngine — Motor de cálculo de recargos, agnóstico al catálogo de turnos.
 *
 * Contiene la lógica pura compartida por los módulos de Médicos y Auxiliares:
 * helpers de fecha/tiempo, ventanas de recargo nocturno por tipo de día, partición
 * de turnos que cruzan medianoche, agregación de filas y reconstrucción de meses.
 *
 * Ningún módulo de UI debería duplicar esta lógica: tanto la tabla/TXT como el
 * guardado en BD deben derivar de `buildTurnoRows` (única fuente de verdad).
 */

import { DayHeader, DoctorSchedule, MonthSchedule, ShiftCell } from "@/src/types/schedule"
import { DEFAULT_RECARGO_CONFIG, type RecargoConfig } from "@/src/types/recargo"
import { isFestivoColombia } from "@/src/services/festivosColombia"

export type DiaBD = "D" | "H" | "S"

/**
 * Jornada ordinaria semanal cuando la semana contiene un festivo (Colombia).
 * Todo lo trabajado por encima de este tope se liquida como hora extra (31–34).
 */
export const WEEKLY_FESTIVO_CAP = 37

/** Conceptos de hora extra por tipo de día y franja horaria. */
const EXTRA_DIURNA_ORDINARIA = 31 // L–S no festivo, 06:00–19:00
const EXTRA_NOCTURNA_ORDINARIA = 32 // L–S no festivo, 19:00–06:00
const EXTRA_DIURNA_FESTIVA = 33 // domingo/festivo, 06:00–19:00
const EXTRA_NOCTURNA_FESTIVA = 34 // domingo/festivo, 19:00–06:00

export type TurnoHorario = {
  entrada: string
  salida: string
  total: string
}

export type TurnosByCode = Record<string, TurnoHorario>

/** Fila de turno persistible/visualizable, común a médicos y auxiliares. */
export type TurnoRow = {
  medico: string
  documento: number | null
  fecha: string
  /**
   * Fecha del DÍA DE INICIO del turno. Coincide con `fecha` salvo en el segmento
   * post-medianoche de un turno partido, que se fecha al día siguiente (`fecha`) pero
   * pertenece, para efectos de período/quincena, al día en que empezó el turno. El
   * filtro de período imputa por esta fecha para no perder el cruce a fin de mes.
   */
  fechaInicio: string
  turno_codigo: string
  entrada: string | null
  salida: string | null
  concepto: number
  horas: number
  horasrecargo: number
  diferencia: number
  dia: DiaBD
  mes: number
  dia_numero: number
  festivo?: boolean
  created_at?: string
}

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

export const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"]

// ─── Fecha / tiempo ───────────────────────────────────────────────────────────

export const toDateOnly = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseMonthNumber = (monthLabel: string) => {
  const normalized = monthLabel.toLowerCase()

  const byText = Object.entries(MONTHS_ES).find(([name]) => normalized.includes(name))
  if (byText) return byText[1]

  const numericMatch = normalized.match(/\b(1[0-2]|0?[1-9])\b/)
  if (numericMatch) return Number(numericMatch[1])

  return null
}

const parseYear = (monthLabel: string) => {
  const yearMatch = monthLabel.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) return Number(yearMatch[0])
  return new Date().getFullYear()
}

export const safeDateFromMonthAndDay = (monthLabel: string, dayNumber: number) => {
  const monthNumber = parseMonthNumber(monthLabel) ?? new Date().getMonth() + 1
  const year = parseYear(monthLabel)
  const date = new Date(year, monthNumber - 1, dayNumber)

  if (date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) {
    return null
  }

  return date
}

export const diaFromDate = (date: Date): DiaBD => {
  const day = date.getDay()
  if (day === 0) return "D"
  if (day === 6) return "S"
  return "H"
}

export const splitTurnoTimes = (turnoCode: string, turnosByCode?: TurnosByCode) => {
  if (!turnosByCode) return { entrada: null, salida: null }

  const turno = turnosByCode[turnoCode]
  if (!turno) return { entrada: null, salida: null }

  const entrada = turno.entrada?.trim() || null
  const salida = turno.salida?.trim() || null

  return { entrada, salida }
}

const capitalize = (value: string) => {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export const monthLabelFromDate = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  })
  return capitalize(formatter.format(date))
}

const toMinutes = (time: string | null | undefined): number | null => {
  if (!time) return null
  const [hours, minutes] = time.split(":")
  const h = Number(hours)
  const m = Number(minutes)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

const minutesToHours = (minutes: number) => Number((minutes / 60).toFixed(2))

// Convierte minutos del día a "HH:MM". La medianoche final se expresa como "24:00"
// para diferenciar el cierre de un segmento (20:00–24:00) del inicio del siguiente (00:00–06:00).
const minutesToTimeLabel = (minutes: number) => {
  const clamped = Math.max(0, minutes)
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// ─── Ventanas de recargo ────────────────────────────────────────────────────────

const normalizeRecargoConfig = (config?: RecargoConfig) => ({
  ...DEFAULT_RECARGO_CONFIG,
  ...(config ?? {}),
})

const getRecargoWindows = (dia: DiaBD, config: RecargoConfig) => {
  const nightStart = toMinutes(config.nightStart) ?? toMinutes(DEFAULT_RECARGO_CONFIG.nightStart) ?? 1140
  const nightEnd = toMinutes(config.nightEnd) ?? toMinutes(DEFAULT_RECARGO_CONFIG.nightEnd) ?? 360

  const windows: Array<{ start: number; end: number; concepto: number }> = []
  const crossesDay = nightStart > nightEnd

  if (dia === "D") {
    if (crossesDay) {
      windows.push({ start: 0, end: nightEnd, concepto: 35 })
      windows.push({ start: nightEnd, end: nightStart, concepto: 39 })
      windows.push({ start: nightStart, end: 1440, concepto: 35 })
    } else {
      windows.push({ start: nightStart, end: nightEnd, concepto: 35 })
      windows.push({ start: nightEnd, end: nightStart, concepto: 39 })
    }
  } else {
    if (crossesDay) {
      windows.push({ start: 0, end: nightEnd, concepto: 36 })
      windows.push({ start: nightStart, end: 1440, concepto: 36 })
    } else {
      windows.push({ start: nightStart, end: nightEnd, concepto: 36 })
    }
  }

  return windows
}

const splitByWindows = (
  start: number,
  end: number,
  windows: Array<{ start: number; end: number; concepto: number }>
) => {
  const parts: Array<{ start: number; end: number; concepto: number | null }> = []
  const ordered = [...windows].sort((a, b) => a.start - b.start)
  let cursor = start

  for (const window of ordered) {
    if (window.end <= start || window.start >= end) continue

    if (cursor < window.start) {
      const neutralEnd = Math.min(window.start, end)
      if (neutralEnd > cursor) {
        parts.push({ start: cursor, end: neutralEnd, concepto: null })
      }
      cursor = neutralEnd
    }

    const overlapStart = Math.max(cursor, window.start)
    const overlapEnd = Math.min(end, window.end)
    if (overlapEnd > overlapStart) {
      parts.push({ start: overlapStart, end: overlapEnd, concepto: window.concepto })
      cursor = overlapEnd
    }
  }

  if (cursor < end) {
    parts.push({ start: cursor, end: end, concepto: null })
  }

  return parts
}

/** Conceptos de recargo nocturno (a los que aplica el descuento `nightDiffHours`). */
const NIGHT_RECARGO_CONCEPTOS = new Set([35, 36])

/**
 * Desglosa un tramo [fromMin, toMin] de UNA sola fecha en minutos por concepto de
 * recargo según las ventanas de su tipo de día. La clave 0 agrupa los minutos
 * neutros (horas ordinarias sin recargo, p. ej. el día de un turno hábil).
 *
 * A diferencia del enfoque anterior (un único concepto dominante por tramo), aquí se
 * conservan TODOS los conceptos presentes para emitirlos como filas separadas
 * (p. ej. en festivo: 39 diurno + 35 nocturno conviven en el mismo turno).
 */
const recargoMinsByConcepto = (
  dia: DiaBD,
  fromMin: number,
  toMin: number,
  config: RecargoConfig
): Map<number, number> => {
  const windows = getRecargoWindows(dia, config)
  const parts = splitByWindows(fromMin, toMin, windows)

  const minsByConcepto = new Map<number, number>()
  for (const part of parts) {
    const mins = Math.max(0, part.end - part.start)
    if (mins === 0) continue
    const key = part.concepto ?? 0 // 0 = neutro (horas base sin recargo)
    minsByConcepto.set(key, (minsByConcepto.get(key) ?? 0) + mins)
  }

  return minsByConcepto
}

// ─── Agregación / reconstrucción ─────────────────────────────────────────────────

// Agrega por (medico, fecha, concepto): un mismo día puede tener varias líneas de
// concepto distinto (p. ej. recargo nocturno 36 + hora extra 32) que conviven como
// filas separadas, alineado con la clave única (medico, fecha, concepto) en BD.
//
// `splitByTimeRange` añade entrada|salida a la clave: así, dos tramos del MISMO
// concepto que caen en la misma fecha pero en franjas distintas (p. ej. la cola
// 00:00–06:00 de la noche anterior y la cabeza 20:00–24:00 de la noche del día, ambas
// concepto 36) NO se funden en una sola fila. Se usa solo en la vista de detalle; el
// guardado en BD sigue agregando por (medico, fecha, concepto) para respetar su clave única.
const addRowAggregated = (
  rowsByKey: Map<string, TurnoRow>,
  row: TurnoRow,
  splitByTimeRange = false
) => {
  // El guardado agrupa por (medico, fechaInicio, concepto): un turno nocturno partido
  // por medianoche comparte fechaInicio, así su cuerpo y su cola se funden en UNA fila
  // del día de inicio, sin colisionar con el turno del día siguiente (que tiene otro
  // fechaInicio). Esto evita la corrupción de códigos al recargar (libres/N2 → N1).
  const key = splitByTimeRange
    ? `${row.medico}|${row.fecha}|${row.concepto}|${row.entrada ?? ""}|${row.salida ?? ""}`
    : `${row.medico}|${row.fechaInicio}|${row.concepto}`
  const existing = rowsByKey.get(key)
  if (!existing) {
    rowsByKey.set(key, row)
    return
  }

  rowsByKey.set(key, {
    ...existing,
    turno_codigo: existing.turno_codigo || row.turno_codigo,
    entrada: existing.entrada ?? row.entrada,
    salida: existing.salida ?? row.salida,
    horas: Number((existing.horas + row.horas).toFixed(2)),
    horasrecargo: Number((existing.horasrecargo + row.horasrecargo).toFixed(2)),
    diferencia: Number((existing.diferencia + row.diferencia).toFixed(2)),
    festivo: existing.festivo || row.festivo,
  })
}

export const injectWeeklyTotals = (days: DayHeader[]): DayHeader[] => {
  if (!days.length) return []

  const result: DayHeader[] = []
  let weekIndex = 1

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]
    result.push(day)

    const isLast = index === days.length - 1
    if (day.isSunday || isLast) {
      result.push({
        dayNumber: 0,
        dayLabel: `Total S${weekIndex}`,
        isSunday: false,
        isWeeklyTotal: true,
      })
      weekIndex += 1
    }
  }

  return result
}

export const recalculateDoctorTotals = (doctor: DoctorSchedule, days: DayHeader[]) => {
  const weeklyTotals: number[] = []
  let currentWeekHours = 0
  let monthTotal = 0

  for (const day of days) {
    if (day.isWeeklyTotal) {
      weeklyTotals.push(currentWeekHours)
      currentWeekHours = 0
      continue
    }

    const hours = doctor.shifts[day.dayNumber]?.hours ?? 0
    currentWeekHours += hours
    monthTotal += hours
  }

  return {
    weeklyTotals,
    monthTotal,
  }
}

// ─── Construcción de filas (única fuente de verdad) ──────────────────────────────

export type BuildTurnoRowsOptions = {
  turnosByCode?: TurnosByCode
  recargoConfig?: RecargoConfig
  conceptoDefault?: number
  /** Marca la fila como festivo (p. ej. sufijo "/DF" en auxiliares). Default: false. */
  isFestivo?: (cell?: ShiftCell) => boolean
  /**
   * Mantiene separadas las filas del mismo (medico, fecha, concepto) cuando difieren en
   * franja horaria (entrada/salida). Pensado para la tabla de detalle, donde fundir la
   * cola post-medianoche con la cabeza de la noche siguiente confunde la lectura. El
   * guardado en BD debe dejarlo en `false` (default) para respetar su clave única. */
  splitByTimeRange?: boolean
}

// Segmento de turno dentro de UNA fecha, antes de agregar. Un turno que cruza la
// medianoche genera dos segmentos (uno por fecha). Es el IR intermedio sobre el que
// se aplican el recargo nocturno y el cálculo de horas extra semanales.
type Segment = {
  medico: string
  documento: number | null
  turno_codigo: string
  date: Date
  fecha: string
  fechaInicio: string // fecha del día de inicio del turno (= fecha salvo en el segmento post-medianoche)
  weekKey: string // semana (lunes) del DÍA DE INICIO del turno, para el tope semanal
  effectiveDia: DiaBD // domingo o festivo → "D"; alimenta recargo, extras y la columna Día
  festivo: boolean // marca de festivo de la FILA (calendario o /DF en la fecha física)
  manualFestivo: boolean // solo marca manual "/DF" del turno; dispara el tope semanal
  startMin: number | null // null = sin horario configurado
  endMin: number | null
  horas: number // horas oficiales que cuentan para el tope semanal (de cell.hours)
  diffHours: number // descuento nocturno aplicable (solo el segmento post-medianoche)
  entrada: string | null
  salida: string | null
  mes: number
  dia_numero: number
}

/** Clave de semana (lunes–domingo): fecha del lunes de la semana de `date`. */
const mondayKey = (date: Date): string => {
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  return toDateOnly(addDays(date, offset))
}

const rangeOverlap = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))

// Minutos nocturnos dentro de [from, to] según la ventana nocturna del recargoConfig.
const nightMinutesIn = (from: number, to: number, nightStart: number, nightEnd: number) => {
  if (nightStart > nightEnd) {
    return rangeOverlap(from, to, 0, nightEnd) + rangeOverlap(from, to, nightStart, 1440)
  }
  return rangeOverlap(from, to, nightStart, nightEnd)
}

// Clasifica un tramo extra [from, to] de una fecha en sus conceptos 31–34 según la
// franja (diurna/nocturna por la ventana del recargoConfig) y el tipo de día efectivo.
const classifyExtra = (
  effectiveDia: DiaBD,
  from: number,
  to: number,
  config: RecargoConfig
): Array<{ concepto: number; horas: number }> => {
  const total = Math.max(0, to - from)
  if (total === 0) return []

  const nightStart = toMinutes(config.nightStart) ?? toMinutes(DEFAULT_RECARGO_CONFIG.nightStart) ?? 1140
  const nightEnd = toMinutes(config.nightEnd) ?? toMinutes(DEFAULT_RECARGO_CONFIG.nightEnd) ?? 360

  const nightMins = nightMinutesIn(from, to, nightStart, nightEnd)
  const dayMins = total - nightMins
  const festiva = effectiveDia === "D"

  const out: Array<{ concepto: number; horas: number }> = []
  if (dayMins > 0) {
    out.push({ concepto: festiva ? EXTRA_DIURNA_FESTIVA : EXTRA_DIURNA_ORDINARIA, horas: minutesToHours(dayMins) })
  }
  if (nightMins > 0) {
    out.push({ concepto: festiva ? EXTRA_NOCTURNA_FESTIVA : EXTRA_NOCTURNA_ORDINARIA, horas: minutesToHours(nightMins) })
  }
  return out
}

const baseRow = (seg: Segment, concepto: number, override: Partial<TurnoRow>): TurnoRow => ({
  medico: seg.medico,
  documento: seg.documento,
  fecha: seg.fecha,
  fechaInicio: seg.fechaInicio,
  turno_codigo: seg.turno_codigo,
  entrada: seg.entrada,
  salida: seg.salida,
  concepto,
  horas: 0,
  horasrecargo: 0,
  diferencia: 0,
  // El día efectivo refleja el festivo (festivo/domingo → "D"), de modo que la
  // clasificación de la fila es coherente con su concepto de recargo/extra.
  dia: seg.effectiveDia,
  mes: seg.mes,
  dia_numero: seg.dia_numero,
  festivo: seg.festivo || undefined,
  ...override,
})

/**
 * Construye las filas de turnos a partir de los meses cargados. Es la ÚNICA fuente
 * de verdad: se usa para la tabla de detalle, la exportación TXT y el guardado en BD.
 *
 * Etapas:
 *  1. Segmentos por fecha (un turno que cruza la medianoche se parte en dos).
 *  2. Cálculo del recargo nocturno (conceptos 35/36/39) por segmento.
 *  3. Horas extra semanales: si la semana (lunes–domingo) contiene un festivo, la
 *     jornada ordinaria se topa en 37h y lo trabajado por encima se reclasifica como
 *     hora extra (conceptos 31–34) — de forma EXCLUYENTE: la porción extra ya no
 *     genera recargo nocturno ordinario.
 *
 * Las filas se agregan por (medico, fecha, concepto): un día puede tener varias
 * líneas (p. ej. recargo 36 + extra 32), alineado con la clave única de las tablas.
 */
export const buildTurnoRows = (
  months: MonthSchedule[],
  options: BuildTurnoRowsOptions = {}
): TurnoRow[] => {
  const {
    turnosByCode,
    recargoConfig,
    conceptoDefault = 0,
    isFestivo = () => false,
    splitByTimeRange = false,
  } = options

  const config = normalizeRecargoConfig(recargoConfig)

  // 1) Construir los segmentos a partir de los meses cargados.
  const segments: Segment[] = []

  for (const month of months) {
    const regularDays = month.days.filter((day) => !day.isWeeklyTotal)

    for (const doctor of month.doctors) {
      for (const day of regularDays) {
        const date = safeDateFromMonthAndDay(month.month, day.dayNumber)
        if (!date) continue

        const cell = doctor.shifts[day.dayNumber]
        const code = (cell?.code ?? "").trim().toUpperCase()
        const { entrada, salida } = splitTurnoTimes(code, turnosByCode)
        const startMinutes = toMinutes(entrada)
        const endMinutes = toMinutes(salida)

        const pushSegment = (
          segDate: Date,
          sMin: number | null,
          eMin: number | null,
          segEntrada: string | null,
          segSalida: string | null,
          diffHours: number,
          horas: number
        ) => {
          const manualFestivo = isFestivo(cell)
          // Festivo de la fecha física (calendario o /DF): define el tipo de día efectivo
          // y la marca de la fila. NO se usa para decidir si la semana tiene festivo.
          const festivoFecha = manualFestivo || isFestivoColombia(segDate)
          const realDia = diaFromDate(segDate)
          const effectiveDia: DiaBD = realDia === "D" || festivoFecha ? "D" : realDia
          segments.push({
            medico: doctor.name,
            documento: null,
            turno_codigo: code,
            date: segDate,
            fecha: toDateOnly(segDate),
            // El segmento post-medianoche se fecha al día siguiente (`segDate`), pero para
            // período/quincena pertenece al día en que INICIÓ el turno (`date`).
            fechaInicio: toDateOnly(date),
            // El turno pertenece a la semana de su día de INICIO (`date`), aunque su
            // segmento post-medianoche caiga en el lunes de la semana siguiente.
            weekKey: mondayKey(date),
            effectiveDia,
            festivo: festivoFecha,
            manualFestivo,
            startMin: sMin,
            endMin: eMin,
            horas,
            diffHours,
            entrada: segEntrada,
            salida: segSalida,
            mes: segDate.getMonth() + 1,
            dia_numero: segDate.getDate(),
          })
        }

        // Sin horario configurado: segmento simple (no participa del cálculo de extras).
        if (startMinutes === null || endMinutes === null) {
          pushSegment(date, null, null, entrada, salida, 0, cell?.hours ?? 0)
          continue
        }

        const crossesMidnight = endMinutes < startMinutes
        if (!crossesMidnight) {
          pushSegment(date, startMinutes, endMinutes, entrada, salida, 0, cell?.hours ?? minutesToHours(endMinutes - startMinutes))
          continue
        }

        // Turno partido por medianoche → dos segmentos (uno por fecha). Las horas
        // que cuentan para el tope semanal son las oficiales del turno (`cell.hours`,
        // p. ej. una Noche de 9h), NO los minutos del rango (que sumarían 10h). Se
        // reparten entre ambos segmentos en proporción a sus minutos para que la
        // acumulación coincida con el total semanal real.
        const segAMin = 1440 - startMinutes
        const segBMin = endMinutes
        const totalMin = segAMin + segBMin
        const cellHoras = cell?.hours ?? minutesToHours(totalMin)
        const segAHoras = Number(((cellHoras * segAMin) / totalMin).toFixed(2))
        const segBHoras = Number((cellHoras - segAHoras).toFixed(2))
        pushSegment(date, startMinutes, 1440, entrada, minutesToTimeLabel(1440), 0, segAHoras)
        const nextDay = addDays(date, 1)
        pushSegment(nextDay, 0, endMinutes, minutesToTimeLabel(0), salida, config.nightDiffHours, segBHoras)
      }
    }
  }

  // 2) Agrupar por (medico, semana de inicio) para evaluar el tope semanal.
  const groups = new Map<string, Segment[]>()
  for (const seg of segments) {
    const key = `${seg.medico}|${seg.weekKey}`
    const list = groups.get(key)
    if (list) list.push(seg)
    else groups.set(key, [seg])
  }

  const rowsByKey = new Map<string, TurnoRow>()

  for (const [, group] of groups) {
    // ¿La semana (de inicio) contiene festivo? Festivo de calendario en cualquiera de
    // sus 7 días (aunque no se trabaje), o marca manual "/DF" de un turno que inicia en
    // la semana. NO se considera la fecha física de un segmento post-medianoche, que
    // puede caer en el lunes festivo de la semana siguiente.
    const monday = new Date(`${group[0].weekKey}T00:00:00`)
    let festivoWeek = group.some((s) => s.manualFestivo)
    for (let d = 0; d < 7 && !festivoWeek; d += 1) {
      if (isFestivoColombia(addDays(monday, d))) festivoWeek = true
    }

    // Orden cronológico: por fecha y, dentro del día, por hora de entrada.
    const ordered = [...group].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return (a.startMin ?? -1) - (b.startMin ?? -1)
    })

    let cumulative = 0

    // Emite la parte ordinaria del tramo [from, to] como UNA fila por concepto de
    // recargo (35/36/39), más una fila neutra (concepto 0) por las horas base sin
    // recargo. El descuento nocturno (`nightDiffHours`) se aplica al concepto
    // nocturno (35/36) del segmento posterior a la medianoche.
    const emitOrdinary = (
      seg: Segment,
      from: number,
      to: number,
      segEntrada: string | null,
      segSalida: string | null
    ) => {
      const minsByConcepto = recargoMinsByConcepto(seg.effectiveDia, from, to, config)
      let diffMins = seg.diffHours > 0 ? Math.round(seg.diffHours * 60) : 0

      for (const [concepto, mins] of minsByConcepto) {
        if (concepto === 0) {
          // Horas base ordinarias (sin recargo).
          addRowAggregated(
            rowsByKey,
            baseRow(seg, conceptoDefault, {
              horas: minutesToHours(mins),
              entrada: segEntrada,
              salida: segSalida,
            }),
            splitByTimeRange
          )
          continue
        }

        let recargoMins = mins
        let diferencia = 0
        if (diffMins > 0 && NIGHT_RECARGO_CONCEPTOS.has(concepto)) {
          const applied = Math.min(recargoMins, diffMins)
          recargoMins -= applied
          diferencia = -minutesToHours(applied)
          diffMins -= applied
        }

        addRowAggregated(
          rowsByKey,
          baseRow(seg, concepto, {
            horas: minutesToHours(mins),
            horasrecargo: minutesToHours(recargoMins),
            diferencia,
            entrada: segEntrada,
            salida: segSalida,
          }),
          splitByTimeRange
        )
      }
    }

    // Emite la parte extra [from, to] clasificada en 31–34. La franja [from, to] es de
    // reloj, pero la CANTIDAD total se escala a `officialHoras` (las horas oficiales del
    // turno que exceden el tope) para que coincida con el conteo del tope (p. ej. una
    // Noche cuenta 9h oficiales, no 10h de rango). El reparto diurna/nocturna conserva
    // la proporción de reloj.
    const emitExtra = (seg: Segment, from: number, to: number, officialHoras: number) => {
      const parts = classifyExtra(seg.effectiveDia, from, to, config)
      const rangeHoras = parts.reduce((sum, p) => sum + p.horas, 0)
      if (rangeHoras <= 0 || officialHoras <= 0) return
      const scale = officialHoras / rangeHoras
      for (const part of parts) {
        const horas = Number((part.horas * scale).toFixed(2))
        addRowAggregated(
          rowsByKey,
          baseRow(seg, part.concepto, {
            horas,
            horasrecargo: horas, // "Cantidad" que exporta el TXT
            diferencia: 0,
            entrada: minutesToTimeLabel(from),
            salida: minutesToTimeLabel(to),
          }),
          splitByTimeRange
        )
      }
    }

    for (const seg of ordered) {
      // Segmento sin horario: fila simple de paso (no acumula ni genera extra).
      if (seg.startMin === null || seg.endMin === null) {
        addRowAggregated(rowsByKey, baseRow(seg, conceptoDefault, { horas: seg.horas }), splitByTimeRange)
        continue
      }

      if (!festivoWeek) {
        emitOrdinary(seg, seg.startMin, seg.endMin, seg.entrada, seg.salida)
        continue
      }

      const before = cumulative
      const after = before + seg.horas
      cumulative = after

      if (before >= WEEKLY_FESTIVO_CAP) {
        // Totalmente extra: la cantidad oficial es la del propio turno.
        emitExtra(seg, seg.startMin, seg.endMin, seg.horas)
      } else if (after <= WEEKLY_FESTIVO_CAP) {
        // Totalmente ordinario.
        emitOrdinary(seg, seg.startMin, seg.endMin, seg.entrada, seg.salida)
      } else {
        // Cruza el tope de 37h: partir en ordinario + extra (proporcional al rango).
        const ordinaryHoras = WEEKLY_FESTIVO_CAP - before
        const extraHoras = seg.horas - ordinaryHoras
        const rangeMin = seg.endMin - seg.startMin
        const rawSplit = seg.startMin + Math.round((ordinaryHoras / seg.horas) * rangeMin)
        const splitMin = Math.min(seg.endMin, Math.max(seg.startMin, rawSplit))
        emitOrdinary(seg, seg.startMin, splitMin, seg.entrada, minutesToTimeLabel(splitMin))
        emitExtra(seg, splitMin, seg.endMin, extraHoras)
      }
    }
  }

  const result = [...rowsByKey.values()]
  // Solo en la vista de detalle: fusiona el "sobrante ordinario" mínimo que deja el
  // tope semanal de 37h cuando cae dentro de la cola nocturna. Ese tramo (concepto
  // 35/36 con recargo 0, ya consumido por el descuento nocturno) se mostraba como un
  // micro‑horario confuso (p. ej. 00:00–00:22, −0.37). No afecta los totales ni el
  // guardado (que usa splitByTimeRange=false): solo reubica horas/diferencia al tramo
  // extra contiguo del mismo turno para una lectura limpia.
  return splitByTimeRange ? mergeDiscountRemnants(result) : result
}

/**
 * Fusiona el remanente ordinario nocturno totalmente descontado (recargo 0,
 * diferencia < 0) con el tramo contiguo del mismo (medico, fecha) que empieza donde
 * aquél termina —típicamente la hora extra que sigue tras el tope de 37h—. Conserva
 * la suma de horas y de diferencia; el recargo del remanente es 0, así que ningún
 * total cambia. Pensado solo para la presentación del detalle.
 */
const mergeDiscountRemnants = (rows: TurnoRow[]): TurnoRow[] => {
  const removed = new Set<TurnoRow>()

  for (const remnant of rows) {
    if (removed.has(remnant)) continue
    if (!NIGHT_RECARGO_CONCEPTOS.has(remnant.concepto)) continue
    if (remnant.horasrecargo !== 0 || !(remnant.diferencia < 0)) continue
    if (!remnant.entrada || !remnant.salida) continue

    const target = rows.find(
      (r) =>
        r !== remnant &&
        !removed.has(r) &&
        r.medico === remnant.medico &&
        r.fecha === remnant.fecha &&
        r.entrada === remnant.salida
    )
    if (!target) continue

    target.entrada = remnant.entrada
    target.horas = Number((target.horas + remnant.horas).toFixed(2))
    target.diferencia = Number((target.diferencia + remnant.diferencia).toFixed(2))
    removed.add(remnant)
  }

  return removed.size ? rows.filter((r) => !removed.has(r)) : rows
}

/**
 * Reconstruye `MonthSchedule[]` a partir de filas planas (típicamente leídas de BD).
 * `normalizeCode` valida/normaliza el código de turno según el catálogo del módulo.
 *
 * `hoursByCode` (opcional): si se provee, las horas de cada celda se toman del catálogo
 * según su código en vez de sumar las horas de las filas de recargo. Es necesario en la
 * carga desde BD porque un turno nocturno se persiste partido por medianoche y la suma
 * de tramos daría el span de reloj (p. ej. 9h) en vez de las horas oficiales (N1 = 8h).
 */
export const buildMonthsFromRows = (
  rows: TurnoRow[],
  normalizeCode: (value: string) => string,
  hoursByCode?: Record<string, number>
): MonthSchedule[] => {
  if (!rows.length) return []

  // Cada turno se reconstruye en su DÍA DE INICIO (`fechaInicio`). Un turno nocturno
  // partido por medianoche se guardó en dos fechas físicas pero comparte fechaInicio,
  // de modo que sus filas se imputan al día en que EMPEZÓ y no contaminan el día
  // siguiente (libre u otro turno) —origen del bug (libres → N1, N2 → N1, M1 → N1).
  // (Filas antiguas sin fechaInicio caen de vuelta en `fecha`.)
  type Cell = { date: Date; code: string; hours: number; festivo: boolean }
  const cellsByMedico = new Map<string, Map<string, Cell>>()

  for (const row of rows) {
    const name = (row.medico ?? "").trim()
    if (!name) continue
    const startStr = row.fechaInicio || row.fecha
    const date = new Date(`${startStr}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue

    let byDate = cellsByMedico.get(name)
    if (!byDate) {
      byDate = new Map<string, Cell>()
      cellsByMedico.set(name, byDate)
    }
    const key = toDateOnly(date)
    let cell = byDate.get(key)
    if (!cell) {
      cell = { date, code: "", hours: 0, festivo: false }
      byDate.set(key, cell)
    }

    const code = normalizeCode(row.turno_codigo)
    if (code) cell.code = code
    cell.hours = Number((cell.hours + (Number(row.horas) || 0)).toFixed(2))
    if (row.festivo) cell.festivo = true
  }

  const grouped = new Map<
    string,
    {
      date: Date
      daysByNumber: Map<number, DayHeader>
      doctorsByName: Map<string, DoctorSchedule>
    }
  >()

  for (const [name, byDate] of cellsByMedico) {
    for (const cell of byDate.values()) {
      const date = cell.date
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

      let group = grouped.get(monthKey)
      if (!group) {
        group = { date, daysByNumber: new Map<number, DayHeader>(), doctorsByName: new Map<string, DoctorSchedule>() }
        grouped.set(monthKey, group)
      }

      const diaNumero = date.getDate()
      if (!group.daysByNumber.has(diaNumero)) {
        const dayOfWeek = date.getDay()
        group.daysByNumber.set(diaNumero, {
          dayNumber: diaNumero,
          dayLabel: DAY_LABELS[dayOfWeek],
          isSunday: dayOfWeek === 0,
          isWeeklyTotal: false,
        })
      }

      let doctor = group.doctorsByName.get(name)
      if (!doctor) {
        doctor = { name, shifts: {}, weeklyTotals: [], monthTotal: 0 }
        group.doctorsByName.set(name, doctor)
      }

      // Horas oficiales del catálogo cuando esté disponible (evita el span de reloj
      // inflado de las noches partidas por medianoche). Solo para turnos con horario
      // (catálogo > 0): las AUSENCIAS (INCAP/INCP… catálogo 0) conservan las horas
      // acumuladas del Excel, que pueden ser > 0 y no deben resetearse.
      const catalogHours = hoursByCode && cell.code ? hoursByCode[cell.code] : undefined
      doctor.shifts[diaNumero] = {
        code: cell.code,
        hours: catalogHours && catalogHours > 0 ? catalogHours : cell.hours,
        festivo: cell.festivo || undefined,
      }
    }
  }

  const months: Array<{ key: string; value: MonthSchedule }> = []

  for (const [key, group] of grouped) {
    const regularDays = [...group.daysByNumber.values()].sort((a, b) => a.dayNumber - b.dayNumber)
    const days = injectWeeklyTotals(regularDays)

    const doctors = [...group.doctorsByName.values()]
      .map((doctor) => {
        const totals = recalculateDoctorTotals(doctor, days)
        return {
          ...doctor,
          weeklyTotals: totals.weeklyTotals,
          monthTotal: totals.monthTotal,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    months.push({
      key,
      value: {
        month: monthLabelFromDate(group.date),
        days,
        doctors,
      },
    })
  }

  return months
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => entry.value)
}
