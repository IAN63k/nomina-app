"use client"

import { useEffect, useMemo, useState } from "react"
import { Stethoscope } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DoctorSummary } from "@/src/components/DoctorSummary"
import { FileUpload } from "@/src/components/FileUpload"
import { MonthTabs } from "@/src/components/MonthTabs"
import { ScheduleTable } from "@/src/components/ScheduleTable"
import { useSchedule } from "@/src/hooks/useSchedule"
import { useMedicosTurnos } from "@/contexts/medicos-turnos-context"
import { useSettingsSidebar } from "@/contexts/settings-sidebar-context"
import { fetchTurnosMedicos, mapDbRowsToMonths, mapMonthsToTurnosRows, upsertTurnosMedicos } from "@/src/services/turnosMedicosDb"

export function HorasExtrasMedicosTab() {
  const { hoursByCode, timeRangeByCode, turnosCodes, turnos } = useMedicosTurnos()
  const { recargoConfig } = useSettingsSidebar()
  const [dbLoading, setDbLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [saveSuggestionVisible, setSaveSuggestionVisible] = useState(false)
  const [savingToDb, setSavingToDb] = useState(false)
  const [dbMessage, setDbMessage] = useState<string | null>(null)

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
    setMonthsData,
  } = useSchedule({ hoursByCode })

  const totalDbRows = useMemo(
    () =>
      months.reduce(
        (total, month) =>
          total +
          month.doctors.reduce((doctorTotal, doctor) => {
            const daysCount = month.days.filter((day) => !day.isWeeklyTotal).length
            return doctorTotal + daysCount
          }, 0),
        0
      ),
    [months]
  )

  useEffect(() => {
    let isMounted = true

    const loadFromDb = async () => {
      setDbLoading(true)
      setDbError(null)
      try {
        const rows = await fetchTurnosMedicos()
        if (!isMounted) return

        if (!rows.length) {
          setDbMessage("Sin datos guardados en BD todavía. Puedes cargar un archivo para comenzar.")
          return
        }

        const mappedMonths = mapDbRowsToMonths(rows)
        if (mappedMonths.length) {
          setMonthsData(mappedMonths)
          setDbMessage(`Se cargaron ${rows.length} registros guardados en la base de datos.`)
        }
      } catch (error) {
        if (!isMounted) return
        const message = error instanceof Error ? error.message : "No se pudieron cargar los datos desde BD"
        setDbError(message)
      } finally {
        if (isMounted) {
          setDbLoading(false)
        }
      }
    }

    loadFromDb()

    return () => {
      isMounted = false
    }
  }, [setMonthsData])

  const handleFileWithSaveSuggestion = async (file: File) => {
    setDbError(null)
    const loaded = await handleFile(file)
    if (!loaded) return

    setSaveSuggestionVisible(true)
    setDbMessage("Archivo cargado correctamente. ¿Deseas guardar estos datos en la base de datos?")
  }

  const handleSaveToDb = async () => {
    if (!months.length) return

    setDbError(null)
    setSavingToDb(true)
    try {
      const rows = mapMonthsToTurnosRows(months, turnos, recargoConfig)
      const inserted = await upsertTurnosMedicos(rows)
      setSaveSuggestionVisible(false)
      setDbMessage(`Datos guardados en BD (${inserted} filas).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar en la base de datos"
      setDbError(message)
    } finally {
      setSavingToDb(false)
    }
  }

  return (
    <section className="rounded-xl p-6">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <Stethoscope className="h-3.5 w-3.5" />
        Pestaña Médicos
      </div>

      <div className="flex flex-col gap-4">
        <FileUpload onFile={handleFileWithSaveSuggestion} loading={loading} error={error} />

        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
          {dbLoading ? <p className="text-muted-foreground">Consultando información guardada en BD...</p> : null}
          {!dbLoading && dbMessage ? <p className="text-foreground">{dbMessage}</p> : null}
          {dbError ? <p className="text-destructive">Error BD: {dbError}</p> : null}

          {saveSuggestionVisible ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={handleSaveToDb} disabled={savingToDb || loading}>
                {savingToDb ? "Guardando..." : "Sí, guardar en BD"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSaveSuggestionVisible(false)
                  setDbMessage("Puedes guardar más tarde cuando lo necesites.")
                }}
                disabled={savingToDb}
              >
                Ahora no
              </Button>
            </div>
          ) : null}

          {!saveSuggestionVisible && months.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleSaveToDb} disabled={savingToDb || loading}>
                {savingToDb ? "Guardando..." : `Guardar en BD (${totalDbRows} filas)`}
              </Button>
            </div>
          ) : null}
        </div>

        {months.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonthTabs
                months={months.map((month) => month.month)}
                activeIndex={activeMonthIndex}
                onSelect={setActiveMonthIndex}
              />
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
              >
                Exportar CSV
              </button>
            </div>

            <ScheduleTable month={activeMonth} onShiftChange={updateShift} timeRangeByCode={timeRangeByCode} availableTurnos={turnosCodes} />

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
          </>
        ) : null}
      </div>
    </section>
  )
}
