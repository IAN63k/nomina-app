import * as XLSX from "xlsx";
import { SUNDAY_LABEL, WEEK_TOTAL_KEYWORD, XLSX_MIME_TYPES } from "@/src/constants/shifts";
import { DayHeader, DoctorSchedule, MonthSchedule, ShiftCell } from "@/src/types/schedule";

const isValidMime = (file: File) => XLSX_MIME_TYPES.includes(file.type) || file.name.toLowerCase().endsWith(".xlsx");

/**
 * `extraCodes`: turnos personalizados vigentes (`MedicosTurnosContext.turnosCodes`).
 * Sin esto, un código como "ET" del Excel se descarta silenciosamente (solo se
 * reconocen M/T/N/L/A).
 */
const toShiftCode = (value: unknown, extraCodes?: Iterable<string>): string => {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "M" || code === "T" || code === "N" || code === "L" || code === "A") return code;
  if (extraCodes) {
    for (const extra of extraCodes) {
      if ((extra ?? "").trim().toUpperCase() === code) return code;
    }
  }
  return "";
};

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const findTotalColumnIndex = (dayLabelsRow: unknown[], dayNumbersRow: unknown[]): number => {
  const rowsToScan = [dayLabelsRow, dayNumbersRow];
  for (const row of rowsToScan) {
    const idx = row.findIndex((cell) => typeof cell === "string" && cell.toLowerCase().includes("total"));
    if (idx >= 0) return idx;
  }
  return Math.max(dayLabelsRow.length, dayNumbersRow.length) - 1;
};

const WEEKDAY_LETTERS = new Set(["L", "M", "X", "J", "V", "S", "D"]);

/**
 * Detecta la fila de etiquetas de día (L/M/M/J/V/S/D) escaneando las primeras filas
 * de la hoja, en vez de asumir que siempre está en `rows[1]`. Algunas hojas del mismo
 * libro traen una fila de título en blanco antes de la cabecera (p. ej. "ENERO",
 * "JULIO") y otras no (p. ej. una hoja "agosto" a la que se le olvidó esa fila): con
 * un offset fijo, la fila de etiquetas real cae en `rows[0]` para esa hoja, se lee mal
 * como `dayLabelsRow`/`dayNumbersRow`, y termina por no reconocer NINGÚN día del mes
 * (todas las columnas se descartan) — el mes completo desaparece de la malla sin
 * ningún aviso, aunque los datos estén ahí.
 */
const findLabelRowIndex = (rows: unknown[][]): number => {
  const limit = Math.min(rows.length, 5);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!row) continue
    let matches = 0;
    for (let col = 1; col < row.length; col += 1) {
      const v = String(row[col] ?? "").trim().toUpperCase();
      if (WEEKDAY_LETTERS.has(v)) matches += 1;
    }
    if (matches >= 3) return i;
  }
  return 1; // fallback al offset histórico si no se detecta ninguna fila de etiquetas
};

const buildDayHeaders = (dayLabelsRow: unknown[], dayNumbersRow: unknown[], totalColumnIndex: number) => {
  // Candidatas en orden de columna: días reales (con su número crudo) o totales
  // semanales. No arman los headers todavía: primero hay que resolver el arranque/
  // cierre de mes (ver abajo) antes de decidir qué candidatas quedan.
  type Candidate =
    | { kind: "total"; colIndex: number }
    | { kind: "day"; colIndex: number; dayNumber: number; rawLabel: string; isSunday: boolean };

  const candidates: Candidate[] = [];

  for (let col = 1; col < totalColumnIndex; col += 1) {
    const rawLabel = String(dayLabelsRow[col] ?? "").trim();
    const rawDayNumber = dayNumbersRow[col];
    const labelUpper = rawLabel.toUpperCase();
    const isSunday = labelUpper === SUNDAY_LABEL;
    const prevLabel = String(dayLabelsRow[col - 1] ?? "").trim().toUpperCase();
    const isPrevSunday = prevLabel === SUNDAY_LABEL;
    const lowerLabel = rawLabel.toLowerCase();
    const isWeeklyTotal = lowerLabel.includes(WEEK_TOTAL_KEYWORD) || (!rawDayNumber && isPrevSunday);

    if (isWeeklyTotal) {
      candidates.push({ kind: "total", colIndex: col });
      continue;
    }

    const dayNumber = Number(rawDayNumber);
    if (!Number.isFinite(dayNumber)) continue;
    candidates.push({ kind: "day", colIndex: col, dayNumber, rawLabel, isSunday });
  }

  // Delimita el tramo real del mes: desde la primera vez que aparece el día 1 hasta
  // que el número deja de incrementarse de a uno. Sin esto, la cola del mes anterior
  // que algunas hojas muestran al inicio de la primera semana para completar el
  // calendario (p. ej. 29/30 de junio antes del 1 de julio) queda con el MISMO
  // dayNumber que el día real del mes objetivo más adelante en la misma hoja — ese
  // día termina duplicado en `days` (dos DayHeader con igual dayNumber) y el motor de
  // recargos procesa su turno dos veces, doblando horas y recargo. El mismo criterio
  // descarta el arranque del mes siguiente si la hoja completa la última semana con
  // sus primeros días.
  const firstDayIdx = candidates.findIndex((c) => c.kind === "day" && c.dayNumber === 1);
  let lastValidIdx = candidates.length - 1;
  if (firstDayIdx >= 0) {
    let expected = 1;
    lastValidIdx = firstDayIdx;
    for (let i = firstDayIdx; i < candidates.length; i += 1) {
      const c = candidates[i];
      if (c.kind === "total") continue;
      if (c.dayNumber !== expected) break;
      lastValidIdx = i;
      expected += 1;
    }
    // El total de la última semana válida va justo después del último día real: se
    // conserva aunque quede "después" del corte, porque pertenece a esa semana.
    if (lastValidIdx + 1 < candidates.length && candidates[lastValidIdx + 1].kind === "total") {
      lastValidIdx += 1;
    }
  }

  const headers: DayHeader[] = [];
  const meta: { header: DayHeader; colIndex: number }[] = [];
  let weekCounter = 1;

  for (let i = 0; i < candidates.length; i += 1) {
    if (firstDayIdx >= 0 && (i < firstDayIdx || i > lastValidIdx)) continue;
    const c = candidates[i];

    if (c.kind === "total") {
      const header: DayHeader = {
        dayNumber: 0,
        dayLabel: `Total S${weekCounter}`,
        isSunday: false,
        isWeeklyTotal: true,
      };
      headers.push(header);
      meta.push({ header, colIndex: c.colIndex });
      weekCounter += 1;
      continue;
    }

    const header: DayHeader = {
      dayNumber: c.dayNumber,
      dayLabel: c.rawLabel || c.rawLabel.toUpperCase(),
      isSunday: c.isSunday,
      isWeeklyTotal: false,
    };
    headers.push(header);
    meta.push({ header, colIndex: c.colIndex });
    if (c.isSunday) weekCounter += 1;
  }

  return { headers, meta };
};

const parseDoctorRows = (
  rows: unknown[][],
  startRow: number,
  columnMeta: { header: DayHeader; colIndex: number }[],
  totalColumnIndex: number,
  extraCodes?: Iterable<string>
) => {
  const doctors: DoctorSchedule[] = [];

  for (let r = startRow; r < rows.length; r += 2) {
    const shiftRow = rows[r] ?? [];
    const hoursRow = rows[r + 1] ?? [];
    const rawName = shiftRow[0];
    const name = String(rawName ?? "").trim();
    if (!name) continue;

    const doctor: DoctorSchedule = {
      name,
      shifts: {},
      weeklyTotals: [],
      monthTotal: 0,
    };

    for (const { header, colIndex } of columnMeta) {
      const shiftCode = toShiftCode(shiftRow[colIndex], extraCodes);
      const hoursValue = toNumber(hoursRow[colIndex]);

      if (header.isWeeklyTotal) {
        doctor.weeklyTotals.push(hoursValue);
        continue;
      }

      doctor.shifts[header.dayNumber] = { code: shiftCode, hours: hoursValue } satisfies ShiftCell;
    }

    doctor.monthTotal = toNumber(hoursRow[totalColumnIndex]);
    doctors.push(doctor);
  }

  return doctors;
};

const parseSheet = (month: string, worksheet: XLSX.WorkSheet, extraCodes?: Iterable<string>): MonthSchedule => {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, blankrows: false });
  if (rows.length < 3) {
    return { month, days: [], doctors: [] } satisfies MonthSchedule;
  }

  const labelRowIndex = findLabelRowIndex(rows);
  const dayLabelsRow = rows[labelRowIndex] ?? [];
  const dayNumbersRow = rows[labelRowIndex + 1] ?? [];
  const totalColumnIndex = findTotalColumnIndex(dayLabelsRow, dayNumbersRow);
  const { headers, meta } = buildDayHeaders(dayLabelsRow, dayNumbersRow, totalColumnIndex);
  const doctors = parseDoctorRows(rows, labelRowIndex + 2, meta, totalColumnIndex, extraCodes);

  return { month, days: headers, doctors } satisfies MonthSchedule;
};

/**
 * `extraCodes`: turnos personalizados vigentes (`MedicosTurnosContext.turnosCodes`),
 * para que el Excel reconozca códigos como "ET" además de M/T/N/L/A.
 */
export const parseExcelFile = async (file: File, extraCodes?: Iterable<string>): Promise<MonthSchedule[]> => {
  if (!isValidMime(file)) {
    throw new Error("El archivo debe ser .xlsx");
  }
  const buffer = await file.arrayBuffer();
  return parseWorkbookBuffer(buffer, extraCodes);
};

export const parseWorkbookBuffer = (buffer: ArrayBuffer, extraCodes?: Iterable<string>): MonthSchedule[] => {
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new Error("No se encontraron hojas en el archivo");
  }

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return { month: sheetName, days: [], doctors: [] } satisfies MonthSchedule;
    return parseSheet(sheetName, worksheet, extraCodes);
  });
};
