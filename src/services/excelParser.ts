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

const buildDayHeaders = (dayLabelsRow: unknown[], dayNumbersRow: unknown[], totalColumnIndex: number) => {
  const headers: DayHeader[] = [];
  const meta: { header: DayHeader; colIndex: number }[] = [];
  let weekCounter = 1;

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
      const header: DayHeader = {
        dayNumber: 0,
        dayLabel: `Total S${weekCounter}`,
        isSunday: false,
        isWeeklyTotal: true,
      };
      headers.push(header);
      meta.push({ header, colIndex: col });
      weekCounter += 1;
      continue;
    }

    const dayNumber = Number(rawDayNumber);
    if (!Number.isFinite(dayNumber)) continue;

    const header: DayHeader = {
      dayNumber,
      dayLabel: rawLabel || labelUpper,
      isSunday,
      isWeeklyTotal: false,
    };
    headers.push(header);
    meta.push({ header, colIndex: col });
    if (isSunday) weekCounter += 1;
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

  const dayLabelsRow = rows[1] ?? [];
  const dayNumbersRow = rows[2] ?? [];
  const totalColumnIndex = findTotalColumnIndex(dayLabelsRow, dayNumbersRow);
  const { headers, meta } = buildDayHeaders(dayLabelsRow, dayNumbersRow, totalColumnIndex);
  const doctors = parseDoctorRows(rows, 3, meta, totalColumnIndex, extraCodes);

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
