/**
 * auxiliaresParser — Parser del Excel de turnos de Auxiliares.
 *
 * Formato (distinto al de médicos): una hoja con BLOQUES SEMANALES apilados
 * verticalmente. Cada bloque:
 *   - Fila cabecera: col0 = fecha serial Excel del lunes; cols 1,3,5… = etiquetas L/M/M/J/V/S/D.
 *   - Fila "NOMBRE": números de día.
 *   - Filas de auxiliar: col0 = nombre; pares (turno, horas) en cols 1‑2, 3‑4, … 13‑14; total en col 15.
 * Las semanas cruzan meses, por lo que cada día se asigna a su mes calendario real
 * (derivado del lunes + offset), no del nombre de la hoja.
 */

import * as XLSX from "xlsx"
import { XLSX_MIME_TYPES } from "@/src/constants/shifts"
import { AUX_ABSENCE_CODES, normalizeAuxCode } from "@/src/constants/auxiliaresShifts"
import { MonthSchedule } from "@/src/types/schedule"
import {
  buildMonthsFromRows,
  diaFromDate,
  toDateOnly,
  type TurnoRow,
} from "@/src/services/recargoEngine"

const SERIAL_MIN = 40000

const JUNK_NAMES = new Set([
  "NOMBRE",
  "NOMBRE Y APELLIDO",
  "DATOS DE INDENTIFICACIÓN",
  "DATOS DE IDENTIFICACIÓN",
])

const isValidMime = (file: File) =>
  XLSX_MIME_TYPES.includes(file.type) || file.name.toLowerCase().endsWith(".xlsx")

const isBlockHeader = (row: unknown[]) => typeof row?.[0] === "number" && (row[0] as number) > SERIAL_MIN

const isValidName = (value: unknown): value is string => {
  if (typeof value !== "string") return false
  const s = value.trim()
  if (s.length < 3) return false
  if (JUNK_NAMES.has(s.toUpperCase())) return false
  if (/^\d+$/.test(s)) return false
  return true
}

const serialToMonday = (serial: number): Date | null => {
  const parsed = XLSX.SSF.parse_date_code(serial)
  if (!parsed) return null
  return new Date(parsed.y, parsed.m - 1, parsed.d)
}

// Primer número de día impreso del bloque (fila bajo la cabecera, cols 1,3,5…).
// Es el "lunes" tal como lo ve el humano y se usa para detectar un serial corrupto.
const firstDayNumber = (row: unknown[] | undefined): number | null => {
  if (!row) return null
  const n = Number(String(row[1] ?? "").trim())
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Resuelve una celda cruda a `{ code, hours, festivo }`:
 *  - `festivo` si el texto contiene "DF" (p. ej. "M1/DF").
 *  - código base = texto antes de "/" (descarta modificadores como "/incap").
 *  - "N" se resuelve por horas: ≥8 → N1 (21:00–06:00); 1‑7 → N2 (22:00–06:00); 0 → sin turno.
 *  - código de turno (no ausencia) con 0 horas → sin turno (evita recargo espurio).
 */
const resolveAuxCell = (rawCode: unknown, rawHours: unknown): { code: string; hours: number; festivo: boolean } => {
  const raw = String(rawCode ?? "").trim()
  const hours = Number.isFinite(Number(rawHours)) ? Number(rawHours) : 0
  if (!raw) return { code: "", hours: 0, festivo: false }

  const upper = raw.toUpperCase()
  const festivo = upper.includes("DF")
  let base = upper.split("/")[0].replace(/\s+/g, "")

  if (base === "N") {
    base = hours >= 8 ? "N1" : hours > 0 ? "N2" : ""
  }

  const code = normalizeAuxCode(base)
  if (!code) return { code: "", hours, festivo }

  // Turno con horario pero 0 horas → tratar como sin turno (no genera recargo).
  if (!AUX_ABSENCE_CODES.has(code) && hours === 0) {
    return { code: "", hours: 0, festivo: false }
  }

  return { code, hours, festivo }
}

const blankRow = (medico: string, date: Date, resolved: { code: string; hours: number; festivo: boolean }): TurnoRow => ({
  medico,
  documento: null,
  fecha: toDateOnly(date),
  fechaInicio: toDateOnly(date),
  turno_codigo: resolved.code,
  entrada: null,
  salida: null,
  concepto: 0,
  horas: resolved.hours,
  horasrecargo: 0,
  diferencia: 0,
  dia: diaFromDate(date),
  mes: date.getMonth() + 1,
  dia_numero: date.getDate(),
  festivo: resolved.festivo || undefined,
})

const parseSheet = (rows: unknown[][]): MonthSchedule[] => {
  const out: TurnoRow[] = []
  let i = 0
  // Lunes del bloque anterior. Las semanas están apiladas de forma contigua, así que
  // sirve para detectar y corregir un serial de cabecera corrupto (ver abajo).
  let prevMonday: Date | null = null

  while (i < rows.length) {
    const headerRow = rows[i]
    if (!isBlockHeader(headerRow)) {
      i += 1
      continue
    }

    let monday = serialToMonday(headerRow[0] as number)

    // Corrección de serial corrupto: a veces la celda de fecha de la cabecera trae un
    // serial equivocado (p. ej. apunta al domingo de la semana, no al lunes), lo que
    // desplazaría todo el bloque a fechas erróneas y dejaría una semana vacía en la
    // malla. Si el serial no continúa la semana anterior (prevMonday + 7) pero el
    // número de día IMPRESO en el bloque sí coincide con ese lunes esperado, mandamos
    // el dato visible: usamos el lunes esperado. (Una semana realmente saltada no
    // coincidiría con el día impreso, así que no se "corrige" de más.)
    if (prevMonday) {
      const expected = addDays(prevMonday, 7)
      const serialMatchesExpected = !!monday && monday.getTime() === expected.getTime()
      if (!serialMatchesExpected && firstDayNumber(rows[i + 1]) === expected.getDate()) {
        monday = expected
      }
    }

    if (!monday) {
      i += 1
      continue
    }
    prevMonday = monday

    // La fila siguiente a la cabecera es la de "NOMBRE"/números de día → saltarla.
    let j = i + 1
    if (j < rows.length && !isValidName(rows[j]?.[0]) && !isBlockHeader(rows[j])) {
      j += 1
    }

    for (; j < rows.length; j += 1) {
      const row = rows[j]
      if (isBlockHeader(row)) break
      if (!isValidName(row?.[0])) continue

      const name = String(row[0]).trim().replace(/\s+/g, " ")

      for (let d = 0; d < 7; d += 1) {
        const codeCol = 1 + d * 2
        const resolved = resolveAuxCell(row[codeCol], row[codeCol + 1])
        out.push(blankRow(name, addDays(monday, d), resolved))
      }
    }

    i = j
  }

  return buildMonthsFromRows(out, normalizeAuxCode)
}

export const parseAuxiliaresFile = async (file: File): Promise<MonthSchedule[]> => {
  if (!isValidMime(file)) {
    throw new Error("El archivo debe ser .xlsx")
  }
  const buffer = await file.arrayBuffer()
  return parseAuxiliaresBuffer(buffer)
}

export const parseAuxiliaresBuffer = (buffer: ArrayBuffer): MonthSchedule[] => {
  const workbook = XLSX.read(buffer, { type: "array" })
  if (!workbook.SheetNames.length) {
    throw new Error("No se encontraron hojas en el archivo")
  }

  // Preferir la hoja "Aux"; si no existe, usar la primera con contenido.
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase() === "aux") ?? workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    throw new Error("La hoja de auxiliares está vacía")
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, blankrows: false })
  return parseSheet(rows)
}
