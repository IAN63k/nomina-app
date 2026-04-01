export type ShiftCode = "M" | "T" | "N" | "L" | "A" | "";

export interface ShiftCell {
  code: ShiftCode;
  hours: number;
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
