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
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
        {availableTurnos.map((code) => {
          const shift = SHIFT_DETAILS[code as keyof typeof SHIFT_DETAILS]
          const isDefault = ["M", "T", "N", "L", "A"].includes(code)
          const colors = shift || { 
            bg: "bg-slate-200", 
            text: "text-slate-900", 
            border: "border-slate-300",
            label: code
          }
          return (
            <div key={code} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold ${colors.bg} ${colors.text} ${colors.border}`}>
                {code}
              </span>
              <span className="text-foreground/90">{colors.label || code}</span>
            </div>
          );
        })}
        <span className="ml-auto text-[11px] text-muted-foreground">Domingos en rojo · Totales semanales en oscuro</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-foreground/90">
            <th className="sticky left-0 top-0 z-30 w-56 border-b border-border bg-background/95 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur supports-backdrop-filter:bg-background/75 after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border">
              Medicos
            </th>
            {month.days.map((day) => {
              const isSunday = day.isSunday;
              const isWeeklyTotal = day.isWeeklyTotal;
              const baseClass = isWeeklyTotal
                ? "bg-foreground text-background"
                : isSunday
                ? "bg-red-50 text-red-700"
                : "bg-background text-foreground/90";
              return (
                <th
                  key={`${day.dayLabel}-${day.dayNumber}-${day.isWeeklyTotal}`}
                  className={`sticky top-0 z-20 whitespace-nowrap border-b border-border px-2 py-2 text-center text-[11px] font-semibold ${baseClass} backdrop-blur supports-backdrop-filter:bg-background/75`}
                >
                  <div className="leading-tight">
                    <div className="text-[10px] uppercase tracking-widest opacity-70">{day.dayLabel}</div>
                    {!day.isWeeklyTotal && <div className="text-sm font-bold">{day.dayNumber}</div>}
                  </div>
                </th>
              );
            })}
            <th className="sticky right-0 top-0 z-30 border-b border-border bg-background/95 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur supports-backdrop-filter:bg-background/75 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-border">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {month.doctors.map((doctor, rowIdx) => (
            <tr key={doctor.name} className={(rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20") + " group hover:bg-muted/35 transition-colors"}>
              <td className="sticky left-0 z-10 border-b border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors group-hover:bg-muted/30">
                {doctor.name}
              </td>
              {month.days.map((day) => {
                if (day.isWeeklyTotal) {
                  const value = getWeeklyTotalValue(doctor, day.dayLabel);
                  return (
                    <td
                      key={`${doctor.name}-${day.dayLabel}-${day.dayNumber}`}
                      className="border-b border-border bg-foreground/95 px-2 py-2 text-center text-xs font-semibold text-background"
                    >
                      <span className="font-mono tabular-nums">{value || ""}</span>
                    </td>
                  );
                }

                const cell = doctor.shifts[day.dayNumber];
                const cellCode = cell?.code ?? "";
                const colors = SHIFT_COLOR_BY_CODE[cellCode] || {
                  bg: "bg-slate-100",
                  text: "text-slate-900",
                  border: "border-slate-300",
                };
                const detail = cell?.code ? SHIFT_DETAILS[cell.code as keyof typeof SHIFT_DETAILS] : null;
                const codeForRange = cell?.code ?? "";
                const timeRange = timeRangeByCode?.[codeForRange] ?? SHIFT_TIME_RANGES[codeForRange] ?? "Sin horario";
                return (
                  <td
                    key={`${doctor.name}-${day.dayNumber}`}
                    className="border-b border-border px-1.5 py-1.5 text-center align-middle"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                disabled={!onShiftChange}
                                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-1 text-sm font-bold font-mono transition-transform hover:-translate-y-0.5 ${colors.bg} ${colors.text} ${colors.border} ${onShiftChange ? "cursor-pointer" : "cursor-default opacity-80"}`}
                              >
                                {cell?.code ?? ""}
                              </button>
                            </DropdownMenuTrigger>
                            {onShiftChange ? (
                              <DropdownMenuContent align="center" className="w-48">
                                <DropdownMenuLabel>Seleccionar turno</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuRadioGroup
                                  value={cell?.code ?? ""}
                                  onValueChange={(value) => onShiftChange(doctor.name, day.dayNumber, value as ShiftCode)}
                                >
                                  <DropdownMenuRadioItem value="">
                                    {SHIFT_OPTION_LABELS[""]}
                                  </DropdownMenuRadioItem>
                                  {availableTurnos.map((code) => {
                                    const shift = SHIFT_DETAILS[code as keyof typeof SHIFT_DETAILS]
                                    const label = shift?.label || code
                                    return (
                                      <DropdownMenuRadioItem key={code} value={code}>
                                        {code} · {label}
                                      </DropdownMenuRadioItem>
                                    )
                                  })}
                                </DropdownMenuRadioGroup>
                              </DropdownMenuContent>
                            ) : null}
                          </DropdownMenu>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="space-y-0.5">
                        <p className="font-semibold">{doctor.name}</p>
                        <p>Día {day.dayNumber} ({day.dayLabel})</p>
                        <p>Turno: {detail?.label ?? cell?.code ?? "Sin turno"}</p>
                        <p>Horario: {timeRange}</p>
                        <p>Horas: {cell?.hours ?? 0}</p>
                        {onShiftChange ? <p className="text-[11px] text-muted-foreground">Haz clic para editar</p> : null}
                      </TooltipContent>
                    </Tooltip>
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 border-b border-border bg-background px-3 py-2 text-right text-sm font-bold text-foreground">
                <span className="font-mono tabular-nums">{doctor.monthTotal}</span>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}
