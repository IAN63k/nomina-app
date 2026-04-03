'use client'

import { DoctorSummary } from "@/src/components/DoctorSummary";
import { FileUpload } from "@/src/components/FileUpload";
import { MonthTabs } from "@/src/components/MonthTabs";
import { ScheduleTable } from "@/src/components/ScheduleTable";
import { useSchedule } from "@/src/hooks/useSchedule";

export default function App() {
  const {
    months,
    activeMonth,
    activeMonthIndex,
    loading,
    error,
    search,
    sortDirection,
    filteredSummaries,
    handleFile,
    setActiveMonthIndex,
    setSearch,
    toggleSortDirection,
    updateShift,
    exportCsv,
  } = useSchedule();

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-100 via-white to-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Agenda medica</p>
          <h1 className="text-3xl font-semibold">Visor de turnos</h1>
          <p className="text-sm text-slate-500">Carga un Excel y navega por los meses para revisar turnos, horas y totales semanales.</p>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
          <FileUpload onFile={handleFile} loading={loading} error={error} />
        </section>

        {months.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonthTabs months={months.map((m) => m.month)} activeIndex={activeMonthIndex} onSelect={setActiveMonthIndex} />
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
              >
                Exportar CSV
              </button>
            </div>

            <ScheduleTable month={activeMonth} onShiftChange={updateShift} />

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Resumen</p>
                  <p className="text-sm text-slate-700">Horas totales y conteo de turnos</p>
                </div>
              </div>
              <DoctorSummary
                summaries={filteredSummaries}
                search={search}
                sortDirection={sortDirection}
                onSearch={setSearch}
                onToggleSort={toggleSortDirection}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
