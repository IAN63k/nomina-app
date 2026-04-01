import { DayHeader, DoctorSchedule, MonthSchedule, ShiftCode } from "@/src/types/schedule"
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser"
import { DEFAULT_RECARGO_CONFIG, type RecargoConfig } from "@/src/types/recargo"

type DiaBD = "D" | "H" | "S"

type TurnoHorario = {
  entrada: string
  salida: string
  total: string
}

export type TurnosByCode = Record<string, TurnoHorario>

export type TurnoMedicoRow = {
  medico: string
  documento: number | null
  fecha: string
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

const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"]

const KNOWN_SHIFT_CODES: ShiftCode[] = ["", "M", "T", "N", "L", "A"]

const normalizeShiftCode = (value: string): ShiftCode => {
  const upper = (value ?? "").trim().toUpperCase()
  if (KNOWN_SHIFT_CODES.includes(upper as ShiftCode)) {
    return upper as ShiftCode
  }
  return ""
}

const toDateOnly = (date: Date) => {
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

const safeDateFromMonthAndDay = (monthLabel: string, dayNumber: number) => {
  const monthNumber = parseMonthNumber(monthLabel) ?? new Date().getMonth() + 1
  const year = parseYear(monthLabel)
  const date = new Date(year, monthNumber - 1, dayNumber)

  if (date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) {
    return null
  }

  return date
}

const diaFromDate = (date: Date): DiaBD => {
  const day = date.getDay()
  if (day === 0) return "D"
  if (day === 6) return "S"
  return "H"
}

const splitTurnoTimes = (turnoCode: string, turnosByCode?: TurnosByCode) => {
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

const monthLabelFromDate = (date: Date) => {
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

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

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

const addRowAggregated = (rowsByKey: Map<string, TurnoMedicoRow>, row: TurnoMedicoRow) => {
  const key = `${row.medico}|${row.fecha}`
  const existing = rowsByKey.get(key)
  if (!existing) {
    rowsByKey.set(key, row)
    return
  }

  const nextConcept = row.concepto !== 0 ? row.concepto : existing.concepto
  rowsByKey.set(key, {
    ...existing,
    turno_codigo: existing.turno_codigo || row.turno_codigo,
    entrada: existing.entrada ?? row.entrada,
    salida: existing.salida ?? row.salida,
    concepto: nextConcept,
    horas: Number((existing.horas + row.horas).toFixed(2)),
    horasrecargo: Number((existing.horasrecargo + row.horasrecargo).toFixed(2)),
    diferencia: Number((existing.diferencia + row.diferencia).toFixed(2)),
  })
}

const injectWeeklyTotals = (days: DayHeader[]): DayHeader[] => {
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

const recalculateDoctorTotals = (doctor: DoctorSchedule, days: DayHeader[]) => {
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

export const mapMonthsToTurnosRows = (
  months: MonthSchedule[],
  turnosByCode?: TurnosByCode,
  recargoConfig?: RecargoConfig,
  conceptoDefault = 0
): TurnoMedicoRow[] => {
  const rowsByKey = new Map<string, TurnoMedicoRow>()
  const config = normalizeRecargoConfig(recargoConfig)

  for (const month of months) {
    const regularDays = month.days.filter((day) => !day.isWeeklyTotal)

    for (const doctor of month.doctors) {
      for (const day of regularDays) {
        const date = safeDateFromMonthAndDay(month.month, day.dayNumber)
        if (!date) continue

        const cell = doctor.shifts[day.dayNumber]
        const code = (cell?.code ?? "").trim().toUpperCase()
        const { entrada, salida } = splitTurnoTimes(code, turnosByCode)
        const dia = diaFromDate(date)

        const startMinutes = toMinutes(entrada)
        const endMinutes = toMinutes(salida)
        const crossesMidnight = startMinutes !== null && endMinutes !== null ? endMinutes < startMinutes : false

        // Sin horario configurado: se guarda fila simple sin recargos
        if (startMinutes === null || endMinutes === null) {
          addRowAggregated(rowsByKey, {
            medico: doctor.name,
            documento: null,
            fecha: toDateOnly(date),
            turno_codigo: code,
            entrada,
            salida,
            concepto: conceptoDefault,
            horas: cell?.hours ?? 0,
            horasrecargo: 0,
            diferencia: 0,
            dia,
            mes: date.getMonth() + 1,
            dia_numero: day.dayNumber,
          })
          continue
        }

        const windows = getRecargoWindows(dia, config)
        const segments: Array<{
          date: Date
          start: number
          end: number
          concepto: number | null
        }> = []

        if (!crossesMidnight) {
          const slices = splitByWindows(startMinutes, endMinutes, windows)
          slices.forEach((slice) => {
            segments.push({ date, ...slice })
          })
        } else {
          // Cruza medianoche: dividir en día actual y siguiente
          const todaySlices = splitByWindows(startMinutes, 1440, windows)
          todaySlices.forEach((slice) => segments.push({ date, ...slice }))

          const nextDay = addDays(date, 1)
          const nextDia = diaFromDate(nextDay)
          const nextWindows = getRecargoWindows(nextDia, config)
          const nextSlices = splitByWindows(0, endMinutes, nextWindows)
          nextSlices.forEach((slice) => segments.push({ date: nextDay, ...slice }))
        }

        let diffRemaining = crossesMidnight ? config.nightDiffHours : 0

        for (const segment of segments) {
          const minutes = Math.max(0, segment.end - segment.start)
          if (minutes === 0) continue

          const isNightConcept = segment.concepto === 35 || segment.concepto === 36
          const applyDiff = isNightConcept && diffRemaining > 0
          const diff = applyDiff ? diffRemaining * -1 : 0
          if (applyDiff) diffRemaining = 0

          const baseHours = minutesToHours(minutes)
          const recargoHours = segment.concepto ? Math.max(0, baseHours + diff) : 0

          addRowAggregated(rowsByKey, {
            medico: doctor.name,
            documento: null,
            fecha: toDateOnly(segment.date),
            turno_codigo: code,
            entrada,
            salida,
            concepto: segment.concepto ?? conceptoDefault,
            horas: baseHours,
            horasrecargo: recargoHours,
            diferencia: segment.concepto ? diff : 0,
            dia: diaFromDate(segment.date),
            mes: segment.date.getMonth() + 1,
            dia_numero: segment.date.getDate(),
          })
        }
      }
    }
  }

  return [...rowsByKey.values()]
}

export async function upsertTurnosMedicos(rows: TurnoMedicoRow[]) {
  if (!rows.length) return 0

  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("turnos_medicos")
    .upsert(rows, { onConflict: "medico,fecha" })

  if (error) {
    throw new Error(error.message)
  }

  return rows.length
}

export async function fetchTurnosMedicos() {
  const supabase = getSupabaseBrowserClient()

  const { data, error } = await supabase
    .from("turnos_medicos")
    .select("medico, documento, fecha, turno_codigo, entrada, salida, concepto, horas, horasrecargo, diferencia, dia, mes, dia_numero, created_at")
    .order("fecha", { ascending: true })
    .order("medico", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as TurnoMedicoRow[]
}

export const mapDbRowsToMonths = (rows: TurnoMedicoRow[]): MonthSchedule[] => {
  if (!rows.length) return []

  const grouped = new Map<
    string,
    {
      date: Date
      daysByNumber: Map<number, DayHeader>
      doctorsByName: Map<string, DoctorSchedule>
    }
  >()

  for (const row of rows) {
    const date = new Date(`${row.fecha}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, {
        date,
        daysByNumber: new Map<number, DayHeader>(),
        doctorsByName: new Map<string, DoctorSchedule>(),
      })
    }

    const group = grouped.get(monthKey)
    if (!group) continue

    if (!group.daysByNumber.has(row.dia_numero)) {
      const dayOfWeek = date.getDay()
      group.daysByNumber.set(row.dia_numero, {
        dayNumber: row.dia_numero,
        dayLabel: DAY_LABELS[dayOfWeek],
        isSunday: dayOfWeek === 0,
        isWeeklyTotal: false,
      })
    }

    const name = (row.medico ?? "").trim()
    if (!name) continue

    if (!group.doctorsByName.has(name)) {
      group.doctorsByName.set(name, {
        name,
        shifts: {},
        weeklyTotals: [],
        monthTotal: 0,
      })
    }

    const doctor = group.doctorsByName.get(name)
    if (!doctor) continue

    doctor.shifts[row.dia_numero] = {
      code: normalizeShiftCode(row.turno_codigo),
      hours: Number(row.horas) || 0,
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
