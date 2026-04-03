import { ShiftCode } from "@/src/types/schedule";

export type ConcreteShiftCode = Exclude<ShiftCode, "">;

export const SHIFT_CODES: ConcreteShiftCode[] = ["M", "T", "N", "L", "A"];

export const SHIFT_DETAILS: Record<ConcreteShiftCode, { label: string; bg: string; text: string; border: string; description: string }> = {
  M: {
    label: "Manana",
    bg: "bg-[#f7e97d]",
    text: "text-slate-900",
    border: "border-[#ead466]",
    description: "Turno de manana",
  },
  T: {
    label: "Tarde",
    bg: "bg-[#7bb0ff]",
    text: "text-slate-900",
    border: "border-[#5a95ef]",
    description: "Turno de tarde",
  },
  N: {
    label: "Noche",
    bg: "bg-[#23355d]",
    text: "text-slate-100",
    border: "border-[#1a2a4b]",
    description: "Turno de noche",
  },
  L: {
    label: "Libre",
    bg: "bg-white",
    text: "text-slate-500",
    border: "border-slate-200",
    description: "Dia libre",
  },
  A: {
    label: "Ausentismo",
    bg: "bg-[#ffd7d7]",
    text: "text-[#7d1a1a]",
    border: "border-[#f2b0b0]",
    description: "Ausencia o incapacidad",
  },
};

export const SHIFT_COLOR_BY_CODE: Record<ShiftCode, { bg: string; text: string; border: string }> = {
  "": { bg: "bg-white", text: "text-slate-500", border: "border-slate-200" },
  M: SHIFT_DETAILS.M,
  T: SHIFT_DETAILS.T,
  N: SHIFT_DETAILS.N,
  L: SHIFT_DETAILS.L,
  A: SHIFT_DETAILS.A,
};

export const SHIFT_DEFAULT_HOURS: Record<ConcreteShiftCode, number> = {
  M: 7,
  T: 7,
  N: 10,
  L: 0,
  A: 0,
};

export const SHIFT_OPTION_LABELS: Record<ShiftCode, string> = {
  "": "Sin turno",
  M: SHIFT_DETAILS.M.label,
  T: SHIFT_DETAILS.T.label,
  N: SHIFT_DETAILS.N.label,
  L: SHIFT_DETAILS.L.label,
  A: SHIFT_DETAILS.A.label,
};

export const SHIFT_SELECTABLE_CODES: ShiftCode[] = ["", ...SHIFT_CODES];

export const SHIFT_TIME_RANGES: Record<ShiftCode, string> = {
  "": "Sin horario",
  M: "06:00 - 13:00",
  T: "13:00 - 20:00",
  N: "20:00 - 06:00",
  L: "Libre",
  A: "Ausente",
};

export const XLSX_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export const SUNDAY_LABEL = "D";
export const MONTH_TOTAL_HEADER = "Total Horas";
export const WEEK_TOTAL_KEYWORD = "total";
