import { SHIFT_CODES, SHIFT_DETAILS } from "@/src/constants/shifts";

type ShiftMeta = { label: string; bg: string; text: string; border: string };

type DoctorSummaryView = {
  name: string;
  totalHours: number;
  shiftsCount: Record<string, number>;
};

type DoctorSummaryProps = {
  summaries: DoctorSummaryView[];
  search: string;
  sortDirection: "asc" | "desc";
  onSearch: (value: string) => void;
  onToggleSort: () => void;
  /** Catálogo de turnos a contar. Default: turnos de médicos. */
  codes?: string[];
  details?: Record<string, ShiftMeta>;
  emptyLabel?: string;
};

export function DoctorSummary({
  summaries,
  search,
  sortDirection,
  onSearch,
  onToggleSort,
  codes = SHIFT_CODES,
  details = SHIFT_DETAILS,
  emptyLabel = "No hay médicos para mostrar",
}: DoctorSummaryProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filtrar por nombre"
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={onToggleSort}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background shadow-sm transition hover:-translate-y-0.5"
        >
          Orden: {sortDirection === "desc" ? "Mayor a menor" : "Menor a mayor"}
        </button>
      </div>

      {!summaries.length ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{emptyLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajusta el filtro o carga un archivo con datos de horarios.</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((doctor) => (
          <div key={doctor.name} className="rounded-xl border border-border bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
              <p className="text-xl font-bold text-foreground">{doctor.totalHours}h</p>
            </div>
            <div
              className="mt-3 grid gap-2 text-center"
              style={{ gridTemplateColumns: `repeat(${Math.min(codes.length, 7)}, minmax(0, 1fr))` }}
            >
              {codes.map((code) => {
                const meta = details[code];
                if (!meta) return null;
                const count = doctor.shiftsCount[code] ?? 0;
                return (
                  <div key={code} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}>
                    <div className="font-mono text-sm">{code}</div>
                    <div className="text-[11px] opacity-80">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
