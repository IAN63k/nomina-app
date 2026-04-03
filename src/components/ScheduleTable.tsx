import { SHIFT_CODES, SHIFT_COLOR_BY_CODE, SHIFT_DETAILS, SHIFT_OPTION_LABELS, SHIFT_SELECTABLE_CODES, SHIFT_TIME_RANGES } from "@/src/constants/shifts";
import { MonthSchedule, ShiftCode } from "@/src/types/schedule";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ScheduleTableProps = {
  month?: MonthSchedule;
  onShiftChange?: (doctorName: string, dayNumber: number, code: ShiftCode) => void;
  timeRangeByCode?: Partial<Record<ShiftCode, string>>;
  availableTurnos?: string[];
};

export function ScheduleTable({ month, onShiftChange, timeRangeByCode, availableTurnos = SHIFT_CODES }: ScheduleTableProps) {
  if (!month) return null;
  if (!month.days.length || !month.doctors.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">No hay datos para mostrar.</p>
      </div>
    );
  }

  const weeklyHeaders = month.days.filter((d) => d.isWeeklyTotal);

  const getWeeklyTotalValue = (doctor: MonthSchedule["doctors"][number], label: string) => {
    const index = weeklyHeaders.findIndex((d) => d.dayLabel === label);
    return doctor.weeklyTotals[index] ?? 0;
  };

  return (
    <div className="space-y-2.5">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-1.5">
        {availableTurnos.map((code) => {
          const shift = SHIFT_DETAILS[code as keyof typeof SHIFT_DETAILS];
          const colors = shift || {
            bg: "bg-slate-200",
            text: "text-slate-900",
            border: "border-slate-300",
            label: code,
          };
          return (
            <div
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-foreground/70 shadow-sm"
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {code}
              </span>
              <span>{colors.label || code}</span>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-400/60" />
            Domingo
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-foreground/80" />
            Total semana
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {/* Doctor name header */}
              <th
                className="sticky left-0 top-0 z-30 w-52 border-b border-border bg-background px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                style={{ boxShadow: "1px 0 0 0 var(--border)" }}
              >
                Médico
              </th>

              {/* Day headers */}
              {month.days.map((day) => {
                const isWeeklyTotal = day.isWeeklyTotal;
                const isSunday = day.isSunday;

                if (isWeeklyTotal) {
                  return (
                    <th
                      key={`${day.dayLabel}-${day.dayNumber}-total`}
                      className="sticky top-0 z-20 border-b border-l border-border bg-foreground px-2 py-2.5 text-center align-middle"
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-widest text-background/60">
                        sem
                      </div>
                    </th>
                  );
                }

                return (
                  <th
                    key={`${day.dayLabel}-${day.dayNumber}`}
                    className={`sticky top-0 z-20 border-b border-border px-1 py-2.5 text-center align-middle ${
                      isSunday ? "bg-red-50" : "bg-background"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-px">
                      <span
                        className={`text-[9px] font-medium uppercase tracking-widest ${
                          isSunday ? "text-red-400" : "text-muted-foreground/60"
                        }`}
                      >
                        {day.dayLabel}
                      </span>
                      <span
                        className={`text-xs font-semibold leading-none ${
                          isSunday ? "text-red-600" : "text-foreground/80"
                        }`}
                      >
                        {day.dayNumber}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Monthly total header */}
              <th
                className="sticky right-0 top-0 z-30 border-b border-border bg-background px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                style={{ boxShadow: "-1px 0 0 0 var(--border)" }}
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {month.doctors.map((doctor, rowIdx) => (
              <tr
                key={doctor.name}
                className="group transition-colors hover:bg-muted/25"
              >
                {/* Doctor name */}
                <td
                  className="sticky left-0 z-10 max-w-[13rem] truncate border-b border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors group-hover:bg-muted/25"
                  style={{ boxShadow: "1px 0 0 0 var(--border)" }}
                  title={doctor.name}
                >
                  {doctor.name}
                </td>

                {/* Day cells */}
                {month.days.map((day) => {
                  if (day.isWeeklyTotal) {
                    const value = getWeeklyTotalValue(doctor, day.dayLabel);
                    return (
                      <td
                        key={`${doctor.name}-${day.dayLabel}-${day.dayNumber}`}
                        className="border-b border-l border-border bg-foreground/95 px-2 py-2 text-center"
                      >
                        <span className="font-mono text-xs font-semibold tabular-nums text-background/90">
                          {value || ""}
                        </span>
                      </td>
                    );
                  }

                  const cell = doctor.shifts[day.dayNumber];
                  const cellCode = cell?.code ?? "";
                  const colors = SHIFT_COLOR_BY_CODE[cellCode] || {
                    bg: "bg-transparent",
                    text: "text-foreground/30",
                    border: "border-border/40",
                  };
                  const detail = cell?.code ? SHIFT_DETAILS[cell.code as keyof typeof SHIFT_DETAILS] : null;
                  const codeForRange = cell?.code ?? "";
                  const timeRange = timeRangeByCode?.[codeForRange] ?? SHIFT_TIME_RANGES[codeForRange] ?? "Sin horario";

                  return (
                    <td
                      key={`${doctor.name}-${day.dayNumber}`}
                      className={`border-b border-border px-1 py-1.5 text-center align-middle ${
                        day.isSunday ? "bg-red-50/60" : ""
                      }`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={!onShiftChange}
                                  className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded border font-mono text-xs font-bold transition-all ${colors.bg} ${colors.text} ${colors.border} ${
                                    onShiftChange
                                      ? "cursor-pointer hover:opacity-90 hover:shadow-sm active:scale-95"
                                      : "cursor-default"
                                  } ${!cellCode ? "border-dashed opacity-30" : ""}`}
                                >
                                  {cell?.code ?? ""}
                                </button>
                              </DropdownMenuTrigger>
                              {onShiftChange ? (
                                <DropdownMenuContent align="center" className="w-44">
                                  <DropdownMenuLabel className="text-xs">Seleccionar turno</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuRadioGroup
                                    value={cell?.code ?? ""}
                                    onValueChange={(value) =>
                                      onShiftChange(doctor.name, day.dayNumber, value as ShiftCode)
                                    }
                                  >
                                    <DropdownMenuRadioItem value="">
                                      {SHIFT_OPTION_LABELS[""]}
                                    </DropdownMenuRadioItem>
                                    {availableTurnos.map((code) => {
                                      const shift = SHIFT_DETAILS[code as keyof typeof SHIFT_DETAILS];
                                      const label = shift?.label || code;
                                      return (
                                        <DropdownMenuRadioItem key={code} value={code}>
                                          <span className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${SHIFT_COLOR_BY_CODE[code as ShiftCode]?.bg ?? ""} ${SHIFT_COLOR_BY_CODE[code as ShiftCode]?.text ?? ""}`}>
                                            {code}
                                          </span>
                                          {label}
                                        </DropdownMenuRadioItem>
                                      );
                                    })}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                              ) : null}
                            </DropdownMenu>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-semibold">{doctor.name}</p>
                          <p className="text-muted-foreground">
                            {day.dayLabel} {day.dayNumber} · {detail?.label ?? "Sin turno"}
                          </p>
                          {cell?.code && (
                            <p className="text-muted-foreground">
                              {timeRange} · {cell.hours}h
                            </p>
                          )}
                          {onShiftChange && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/70">Clic para editar</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  );
                })}

                {/* Monthly total */}
                <td
                  className="sticky right-0 z-10 border-b border-border bg-background px-4 py-2 text-right transition-colors group-hover:bg-muted/25"
                  style={{ boxShadow: "-1px 0 0 0 var(--border)" }}
                >
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {doctor.monthTotal}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
