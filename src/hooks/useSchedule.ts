import { useCallback, useMemo, useState } from "react";
import { SHIFT_DEFAULT_HOURS } from "@/src/constants/shifts";
import { parseExcelFile } from "@/src/services/excelParser";
import { DoctorSchedule, MonthSchedule, ShiftCode } from "@/src/types/schedule";

type SortDirection = "asc" | "desc";

type DoctorSummary = {
  name: string;
  totalHours: number;
  shiftsCount: Record<ShiftCode, number>;
};

type UseScheduleOptions = {
  hoursByCode?: Partial<Record<ShiftCode, number>>;
};

const initialCounts = (): Record<ShiftCode, number> => ({ "": 0, M: 0, T: 0, N: 0, L: 0, A: 0 });

const recalculateDoctorTotals = (doctor: DoctorSchedule, days: MonthSchedule["days"]) => {
  const weeklyTotals: number[] = [];
  let currentWeekHours = 0;
  let monthTotal = 0;

  for (const day of days) {
    if (day.isWeeklyTotal) {
      weeklyTotals.push(currentWeekHours);
      currentWeekHours = 0;
      continue;
    }

    const hours = doctor.shifts[day.dayNumber]?.hours ?? 0;
    currentWeekHours += hours;
    monthTotal += hours;
  }

  if (!days.some((day) => day.isWeeklyTotal)) {
    weeklyTotals.push(currentWeekHours);
  }

  return { weeklyTotals, monthTotal };
};

const buildCsv = (month: MonthSchedule): string => {
  if (!month.days.length || !month.doctors.length) return "";

  const dayHeaders = month.days.map((d) => (d.isWeeklyTotal ? d.dayLabel : `${d.dayLabel} ${d.dayNumber}`.trim()));
  const headers = ["Doctor", ...dayHeaders, "Total Mes"];
  const rows: string[][] = [headers];

  for (const doctor of month.doctors) {
    const row: string[] = [doctor.name];
    for (const day of month.days) {
      if (day.isWeeklyTotal) {
        const weekIdx = month.days
          .filter((d) => d.isWeeklyTotal)
          .findIndex((d) => d.dayLabel === day.dayLabel);
        row.push(String(doctor.weeklyTotals[weekIdx] ?? ""));
        continue;
      }
      const cell = doctor.shifts[day.dayNumber];
      row.push(cell ? `${cell.code}${cell.hours ? ` (${cell.hours})` : ""}` : "");
    }
    row.push(String(doctor.monthTotal ?? ""));
    rows.push(row);
  }

  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
};

export function useSchedule(options?: UseScheduleOptions) {
  const [months, setMonths] = useState<MonthSchedule[]>([]);
  const [activeMonthIndex, setActiveMonthIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleFile = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const parsed = await parseExcelFile(file);
      setMonths(parsed);
      setActiveMonthIndex(0);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo leer el archivo";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const setMonthsData = useCallback((nextMonths: MonthSchedule[]) => {
    setMonths(nextMonths);
    setActiveMonthIndex(0);
    setError(null);
  }, []);

  const activeMonth = months[activeMonthIndex];

  const doctorSummaries = useMemo<DoctorSummary[]>(() => {
    if (!activeMonth) return [];
    return activeMonth.doctors.map((doctor: DoctorSchedule) => {
      const counts = initialCounts();
      Object.values(doctor.shifts).forEach((cell) => {
        counts[cell.code] = (counts[cell.code] ?? 0) + 1;
      });
      return {
        name: doctor.name,
        totalHours: doctor.monthTotal,
        shiftsCount: counts,
      };
    });
  }, [activeMonth]);

  const filteredSummaries = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? doctorSummaries.filter((d) => d.name.toLowerCase().includes(term))
      : doctorSummaries;

    const sorted = [...filtered].sort((a, b) => {
      if (sortDirection === "desc") return b.totalHours - a.totalHours;
      return a.totalHours - b.totalHours;
    });

    return sorted;
  }, [doctorSummaries, search, sortDirection]);

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  const updateShift = (doctorName: string, dayNumber: number, code: ShiftCode) => {
    setMonths((prevMonths) =>
      prevMonths.map((month, monthIdx) => {
        if (monthIdx !== activeMonthIndex) return month;

        return {
          ...month,
          doctors: month.doctors.map((doctor) => {
            if (doctor.name !== doctorName) return doctor;

            const previousCell = doctor.shifts[dayNumber] ?? { code: "" as ShiftCode, hours: 0 };
            const configuredHours = code === "" ? 0 : options?.hoursByCode?.[code];
            const fallbackHours = code === "" ? 0 : SHIFT_DEFAULT_HOURS[code];
            const nextHours =
              typeof configuredHours === "number" && Number.isFinite(configuredHours)
                ? configuredHours
                : previousCell.hours > 0
                ? previousCell.hours
                : fallbackHours;

            const updatedDoctor: DoctorSchedule = {
              ...doctor,
              shifts: {
                ...doctor.shifts,
                [dayNumber]: {
                  code,
                  hours: nextHours,
                },
              },
            };

            const totals = recalculateDoctorTotals(updatedDoctor, month.days);
            return {
              ...updatedDoctor,
              weeklyTotals: totals.weeklyTotals,
              monthTotal: totals.monthTotal,
            };
          }),
        };
      })
    );
  };

  const exportCsv = () => {
    if (!activeMonth) return;
    const csv = buildCsv(activeMonth);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${activeMonth.month || "horarios"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return {
    months,
    activeMonthIndex,
    activeMonth,
    loading,
    error,
    search,
    sortDirection,
    filteredSummaries,
    handleFile,
    setMonthsData,
    setActiveMonthIndex,
    setSearch,
    toggleSortDirection,
    updateShift,
    exportCsv,
  } as const;
}
