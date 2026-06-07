"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DoctorSummary } from "@/src/components/DoctorSummary"
import { FileUpload } from "@/src/components/FileUpload"
import { MonthTabs } from "@/src/components/MonthTabs"
import { MallaDrawer } from "@/components/recargos/malla-drawer"
import { CargaHorarios } from "@/components/recargos/carga-horarios"
import { TurnosDetailTable } from "@/src/components/TurnosDetailTable"
import { ExportMenu } from "@/src/components/ExportMenu"
import { useSchedule } from "@/src/hooks/useSchedule"
import { usePeriodFilter } from "@/src/hooks/usePeriodFilter"
import { useAuxiliaresTurnos } from "@/contexts/auxiliares-turnos-context"
import { useEmpleados } from "@/contexts/empleados-context"
import { useSettingsSidebar } from "@/contexts/settings-sidebar-context"
import { useAppearance } from "@/contexts/appearance-context"
import { parseAuxiliaresFile } from "@/src/services/auxiliaresParser"
import {
  computeAuxDisplayRows,
  fetchTurnosAuxiliares,
  mapAuxMonthsToTurnosRows,
  mapDbRowsToAuxMonths,
  upsertTurnosAuxiliares,
} from "@/src/services/turnosAuxiliaresDb"
import { AUX_SHIFT_CODES, AUX_SHIFT_COLOR_BY_CODE, AUX_SHIFT_DETAILS } from "@/src/constants/auxiliaresShifts"

export function RecargosAuxiliaresTab() {
  const { hoursByCode, timeRangeByCode, turnosCodes, turnos } = useAuxiliaresTurnos()
  const { recargoConfig } = useSettingsSidebar()
  const { colorOf } = useAppearance()
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
    setMonthsData,
  } = useSchedule({ hoursByCode, parseFile: parseAuxiliaresFile })

  const totalDbRows = useMemo(
    () =>
      months.reduce(
        (total, month) =>
          total +
          month.doctors.reduce((doctorTotal) => {
            const daysCount = month.days.filter((day) => !day.isWeeklyTotal).length
            return doctorTotal + daysCount
          }, 0),
        0
      ),
    [months]
  )

  const activeMonthRows = useMemo(() => {
    if (!activeMonth) return []
    return computeAuxDisplayRows([activeMonth], turnos, recargoConfig)
  }, [activeMonth, turnos, recargoConfig])

  // Inyectar temporalmente la cédula desde el contexto de empleados (solo en memoria/UI)
  const { getCedulaByName } = useEmpleados()

  const activeMonthRowsWithCedula = useMemo(() => {
    return activeMonthRows.map((r) => {
      if (r.documento) return r
      try {
        const ced = getCedulaByName(r.medico)
        if (!ced || ced === "0000000000") return r
        const digits = String(ced).replace(/\D/g, "")
        if (!digits || digits === "0000000000") return r
        const num = Number(digits)
        return { ...r, documento: Number.isFinite(num) ? num : r.documento }
      } catch {
        return r
      }
    })
  }, [activeMonthRows, getCedulaByName])

  // Periodo/quincena compartido por la tabla de detalle y el menú de exportación.
  const period = usePeriodFilter(activeMonthRowsWithCedula)

  // La carga desde BD corre una sola vez al montar; leemos el catálogo de horas vía ref
  // para reconstruir con horas oficiales sin re-disparar el fetch (que pisaría datos
  // subidos sin guardar) cada vez que cambie la configuración de turnos.
  const hoursByCodeRef = useRef(hoursByCode)
  hoursByCodeRef.current = hoursByCode

  useEffect(() => {
    let isMounted = true

    const loadFromDb = async () => {
      setDbLoading(true)
      setDbError(null)
      try {
        const rows = await fetchTurnosAuxiliares()
        if (!isMounted) return

        if (!rows.length) {
          setDbMessage("Sin datos guardados en BD todavía. Puedes cargar un archivo para comenzar.")
          return
        }

        const mappedMonths = mapDbRowsToAuxMonths(rows, hoursByCodeRef.current)
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
      const rows = mapAuxMonthsToTurnosRows(months, turnos, recargoConfig)
      const inserted = await upsertTurnosAuxiliares(rows)
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
        <Users className="h-3.5 w-3.5" />
        Recargos — Auxiliares
      </div>

      <div className="flex flex-col gap-4">
        <CargaHorarios defaultOpen={false}>
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
        </CargaHorarios>

        {months.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonthTabs
                months={months.map((month) => month.month)}
                activeIndex={activeMonthIndex}
                onSelect={setActiveMonthIndex}
              />
              <ExportMenu period={period} />
            </div>

            {/* Detalle del mes — tabla principal */}
            <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-md">
              <div className="mb-4">
                <h2 className="text-lg font-bold tracking-tight text-foreground">Detalle del mes</h2>
                <p className="text-sm text-muted-foreground">Registro completo de turnos y recargos</p>
              </div>
              <TurnosDetailTable period={period} module="auxiliares" />
            </div>

            {/* Resumen */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Resumen</p>
                  <p className="text-sm text-foreground/70">Horas totales y conteo de turnos</p>
                </div>
              </div>
              <DoctorSummary
                summaries={filteredSummaries}
                search={search}
                sortDirection={sortDirection}
                onSearch={setSearch}
                onToggleSort={toggleSortDirection}
                codes={AUX_SHIFT_CODES}
                details={AUX_SHIFT_DETAILS}
                emptyLabel="No hay auxiliares para mostrar"
                colorOf={(code) => colorOf("auxiliares", code)}
              />
            </div>

            {/* Malla de turnos — panel lateral fijo */}
            <MallaDrawer
              month={activeMonth}
              onShiftChange={updateShift}
              timeRangeByCode={timeRangeByCode}
              availableTurnos={turnosCodes}
              nameLabel="Auxiliar"
              shiftDetails={AUX_SHIFT_DETAILS}
              shiftColors={AUX_SHIFT_COLOR_BY_CODE}
              colorOf={(code) => colorOf("auxiliares", code)}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
