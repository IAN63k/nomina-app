export type ShiftCode = "M" | "T" | "N" | "L" | "A" | "";

export interface ShiftCell {
  // Código de turno. Médicos usa el subconjunto `ShiftCode` (M/T/N/L/A); auxiliares
  // usa códigos multi-carácter (M1, M2, T1, N1, …). Por eso es `string` genérico.
  code: string;
  hours: number;
  // Marcado de día festivo (solo auxiliares, vía sufijo "/DF"). Médicos no lo usa.
  festivo?: boolean;
}

export interface DoctorSchedule {
  name: string;
  shifts: Record<number, ShiftCell>;
  weeklyTotals: number[];
  monthTotal: number;
}

export interface DayHeader {
  dayNumber: number;
  dayLabel: string;
  isSunday: boolean;
  isWeeklyTotal: boolean;
}

export interface MonthSchedule {
  month: string;
  days: DayHeader[];
  doctors: DoctorSchedule[];
}
