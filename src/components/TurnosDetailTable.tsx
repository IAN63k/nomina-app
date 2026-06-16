"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Columns3, Eye, EyeOff, Loader2, RotateCcw, Search } from "lucide-react"
import type { TurnoMedicoRow } from "@/src/services/turnosMedicosDb"
import { loadRecargosDetailPrefs, saveRecargosDetailPrefs, type RecargosDetailPrefs } from "@/src/services/userPreferences"
import type { ShiftModule } from "@/src/constants/shiftColors"
import type { PeriodFilter } from "@/src/hooks/usePeriodFilter"
import { AUX_ABSENCE_CODES, AUX_SHIFT_DETAILS } from "@/src/constants/auxiliaresShifts"
import { useAppearance } from "@/contexts/appearance-context"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


type Props = {
  /** Estado de periodo/quincena compartido con el menú de exportación. */
  period: PeriodFilter
  /** Módulo de origen, para resolver el color personalizado del turno. */
  module?: ShiftModule
}

type SortDir = "asc" | "desc"

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const CONCEPTO_LABELS: Record<number, string> = {
  31: "Extra Diurna",
  32: "Extra Nocturna",
  33: "Extra Fest. Diurna",
  34: "Extra Fest. Nocturna",
  35: "Rec. Dom. Nocturno",
  36: "Rec. Lab. Nocturno",
  39: "Horas Dominicales",
  0: "—",
}

const DIA_LABELS: Record<string, string> = {
  D: "Domingo",
  H: "Hábil",
  S: "Sábado",
}

function formatDate(fecha: string) {
  if (!fecha) return ""
  const [y, m, d] = fecha.split("-")
  return `${d}/${m}/${y}`
}

// ─── Ausentismos ──────────────────────────────────────────────────────────────────

const MEDICOS_ABSENCE_LABELS: Record<string, string> = {
  A: "Ausentismo",
  L: "Libre",
}

const AUX_ABSENCE_LABELS: Record<string, string> = Object.fromEntries(
  [...AUX_ABSENCE_CODES].map((code) => [code, AUX_SHIFT_DETAILS[code]?.label ?? code])
)

const AUSENTISMO_STYLES: Record<string, string> = {
  Ausentismo: "bg-red-50 text-red-600 ring-red-200",
  Incapacidad: "bg-red-50 text-red-600 ring-red-200",
  Calamidad: "bg-orange-50 text-orange-600 ring-orange-200",
  Vacaciones: "bg-emerald-50 text-emerald-700 ring-emerald-200",
}

function ausentismoLabel(module: ShiftModule, row: TurnoMedicoRow): string {
  const code = (row.turno_codigo ?? "").trim().toUpperCase()
  if (!code) return ""
  const labels = module === "auxiliares" ? AUX_ABSENCE_LABELS : MEDICOS_ABSENCE_LABELS
  return labels[code] ?? ""
}

// ─── Valores derivados de la fila ─────────────────────────────────────────────────

/** Horario COMPLETO del turno trabajado (catálogo), sin recortar al concepto. */
function turnoTrabajadoOf(row: TurnoMedicoRow): string {
  const entrada = row.turnoEntrada ?? row.entrada
  const salida = row.turnoSalida ?? row.salida
  return entrada && salida ? `${entrada} – ${salida}` : ""
}

/**
 * Franjas exactas donde aplica el concepto de la fila (Desde/Hasta). El motor las
 * calcula en `recargoRanges`; filas antiguas sin el campo caen al tramo entrada/salida.
 */
function recargoRangesOf(row: TurnoMedicoRow): Array<{ desde: string; hasta: string }> {
  if (row.recargoRanges?.length) return row.recargoRanges
  if (row.entrada && row.salida) return [{ desde: row.entrada, hasta: row.salida }]
  return []
}

// ─── Columnas ─────────────────────────────────────────────────────────────────────

type Column = {
  key: string
  label: string
  sortable?: boolean
  align?: "left" | "right" | "center"
  /** Grupo en el menú "Columnas" (recognition over recall). */
  group: string
  /** Siempre visible: no aparece como toggle activo en el menú. */
  lockVisible?: boolean
  /** Oculta por defecto (recuperable desde el menú). */
  defaultHidden?: boolean
}

const COLUMNS: Column[] = [
  { key: "medico",       label: "Nombre",          sortable: true,  align: "left",   group: "Identificación", lockVisible: true },
  { key: "documento",    label: "Cédula",          sortable: true,  align: "left",   group: "Identificación" },
  { key: "fecha",        label: "Fecha",           sortable: true,  align: "left",   group: "Identificación" },
  { key: "turno_codigo", label: "Dig. Turno",      sortable: true,  align: "center", group: "Turno trabajado" },
  { key: "_turno",       label: "Turno trabajado", sortable: true,  align: "center", group: "Turno trabajado" },
  { key: "concepto",     label: "Concepto",        sortable: true,  align: "left",   group: "Recargos" },
  { key: "_desde",       label: "Desde",           sortable: true,  align: "center", group: "Recargos" },
  { key: "_hasta",       label: "Hasta",           sortable: true,  align: "center", group: "Recargos" },
  { key: "horasrecargo", label: "Cantidad",        sortable: true,  align: "center", group: "Recargos" },
  { key: "diferencia",   label: "Diferencia",      sortable: true,  align: "center", group: "Recargos", defaultHidden: true },
  { key: "_ausentismo",  label: "Ausentismo",      sortable: true,  align: "center", group: "Ausentismos" },
  { key: "dia",          label: "Día",             sortable: true,  align: "center", group: "Otros" },
]

const COLUMN_GROUPS = ["Identificación", "Turno trabajado", "Recargos", "Ausentismos", "Otros"]

const defaultVisibility = (): Record<string, boolean> =>
  Object.fromEntries(COLUMNS.map((c) => [c.key, !c.defaultHidden]))

/** Una fila "tiene recargo" si el motor le calculó cantidad de horas de recargo/extra. */
const hasRecargo = (row: TurnoMedicoRow) => row.horasrecargo > 0

function getValue(row: TurnoMedicoRow, key: string, module: ShiftModule): string | number {
  switch (key) {
    case "_turno":
      return turnoTrabajadoOf(row)
    case "_desde":
      return recargoRangesOf(row)[0]?.desde ?? ""
    case "_hasta": {
      const ranges = recargoRangesOf(row)
      return ranges[ranges.length - 1]?.hasta ?? ""
    }
    case "_ausentismo":
      return ausentismoLabel(module, row)
    default:
      return (row as Record<string, unknown>)[key] as string | number ?? ""
  }
}

export function TurnosDetailTable({ period, module = "medicos" }: Props) {
  const { colorOf } = useAppearance()

  // Periodo/quincena: estado compartido con el menú de exportación (usePeriodFilter).
  const {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
    monthInfo,
    isQ1,
    isQ2,
    applyQuincena,
    clearPeriod,
    periodRows,
  } = period

  const [search, setSearch]               = useState("")
  const [filters, setFilters]             = useState<Record<string, string>>({})
  const [page, setPage]                   = useState(1)
  const [pageSize, setPageSize]           = useState(20)
  const [sortCol, setSortCol]             = useState<string>("fecha")
  const [sortDir, setSortDir]             = useState<SortDir>("asc")

  // Preferencias persistidas por módulo (flexibilidad y eficiencia de uso):
  // columnas visibles, filtro "sin recargo" y tamaño de página. Se cargan en un
  // efecto porque la API de preferencias es asíncrona (hoy localStorage, mañana
  // BD) y mientras tanto se muestra un estado de carga (visibilidad del estado
  // del sistema).
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(defaultVisibility)
  const [showSinRecargo, setShowSinRecargo] = useState(false)
  // Módulo cuyas preferencias ya se cargaron: si cambia el módulo, vuelve a
  // mostrarse el estado de carga sin necesidad de un reset síncrono en el efecto.
  const [prefsModule, setPrefsModule] = useState<ShiftModule | null>(null)
  const prefsLoaded = prefsModule === module

  useEffect(() => {
    let active = true
    loadRecargosDetailPrefs(module).then((saved) => {
      if (!active) return
      if (saved?.visibleCols) setVisibleCols({ ...defaultVisibility(), ...saved.visibleCols })
      if (typeof saved?.showSinRecargo === "boolean") setShowSinRecargo(saved.showSinRecargo)
      if (typeof saved?.pageSize === "number" && PAGE_SIZE_OPTIONS.includes(saved.pageSize)) {
        setPageSize(saved.pageSize)
      }
      setPrefsModule(module)
    })
    return () => {
      active = false
    }
  }, [module])

  const visibleColumns = COLUMNS.filter((c) => c.lockVisible || visibleCols[c.key] !== false)
  const hiddenCount = COLUMNS.length - visibleColumns.length

  const persistPrefs = (next: Partial<RecargosDetailPrefs>) => {
    void saveRecargosDetailPrefs(module, { visibleCols, showSinRecargo, pageSize, ...next })
  }

  const toggleColumn = (key: string, visible: boolean) => {
    const nextCols = { ...visibleCols, [key]: visible }
    setVisibleCols(nextCols)
    persistPrefs({ visibleCols: nextCols })
    // Una columna oculta no debe seguir filtrando "invisiblemente" (visibilidad del
    // estado del sistema): al ocultarla se descarta su filtro y, si ordenaba, se
    // vuelve al orden por fecha.
    if (!visible) {
      if (filters[key]?.trim()) {
        setFilters((prev) => ({ ...prev, [key]: "" }))
        setPage(1)
      }
      if (sortCol === key) {
        setSortCol("fecha")
        setSortDir("asc")
      }
    }
  }

  const resetColumns = () => {
    const defaults = defaultVisibility()
    setVisibleCols(defaults)
    persistPrefs({ visibleCols: defaults })
  }

  const toggleSinRecargo = () => {
    const next = !showSinRecargo
    setShowSinRecargo(next)
    persistPrefs({ showSinRecargo: next })
    setPage(1)
  }

  // Al cambiar el periodo o el mes dominante, volver a la primera página para no
  // quedar fuera de rango. Se ajusta durante el render (patrón recomendado de React)
  // en lugar de en un efecto.
  const periodSig = `${periodFrom}|${periodTo}|${monthInfo.ym}`
  const [prevPeriodSig, setPrevPeriodSig] = useState(periodSig)
  if (prevPeriodSig !== periodSig) {
    setPrevPeriodSig(periodSig)
    setPage(1)
  }

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
    setPage(1)
  }

  const setFilter = (key: string, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }))
    setPage(1)
  }

  // Búsqueda + filtros de columna, ANTES del filtro de recargo: así el botón
  // "Mostrar días sin recargo" puede informar cuántas filas hay ocultas.
  const searchedRows = useMemo(() => {
    let res = [...periodRows]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      res = res.filter(r =>
        r.medico.toLowerCase().includes(q) ||
        (r.documento?.toString() ?? "").includes(q) ||
        r.fecha.includes(q)
      )
    }

    for (const [key, val] of Object.entries(filters)) {
      if (!val.trim()) continue
      const q = val.trim().toLowerCase()
      res = res.filter(r => String(getValue(r, key, module)).toLowerCase().includes(q))
    }

    return res
  }, [periodRows, search, filters, module])

  const sinRecargoCount = useMemo(
    () => searchedRows.reduce((acc, r) => acc + (hasRecargo(r) ? 0 : 1), 0),
    [searchedRows]
  )

  const filtered = useMemo(() => {
    // Por defecto solo se listan los días con recargo; el resto se revela con el
    // botón "Mostrar días sin recargo" y, al revelarse, va después (prioridad a
    // las filas con recargo).
    const res = showSinRecargo ? [...searchedRows] : searchedRows.filter(hasRecargo)

    res.sort((a, b) => {
      if (showSinRecargo) {
        const byRecargo = Number(hasRecargo(b)) - Number(hasRecargo(a))
        if (byRecargo !== 0) return byRecargo
      }
      const av = getValue(a, sortCol, module)
      const bv = getValue(b, sortCol, module)
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === "asc" ? cmp : -cmp
    })

    return res
  }, [searchedRows, showSinRecargo, sortCol, sortDir, module])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const pageWindow = () => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i).filter(p => p <= totalPages)
  }

  const renderCell = (row: TurnoMedicoRow, col: Column) => {
    switch (col.key) {
      case "medico":
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 font-medium text-foreground">
            {row.medico}
          </td>
        )
      case "documento":
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 font-mono text-xs text-foreground/70">
            {row.documento ?? <span className="text-muted-foreground/40">—</span>}
          </td>
        )
      case "fecha":
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 font-mono text-xs text-foreground/80">
            {formatDate(row.fecha)}
          </td>
        )
      case "turno_codigo": {
        const shiftColors = row.turno_codigo ? colorOf(module, row.turno_codigo) : null
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center">
            {row.turno_codigo && shiftColors ? (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 font-mono text-[11px] font-bold"
                style={{ backgroundColor: shiftColors.bg, color: shiftColors.text, borderColor: shiftColors.border }}
              >
                {row.turno_codigo}
              </span>
            ) : <span className="text-muted-foreground/30">—</span>}
          </td>
        )
      }
      case "_turno": {
        const turno = turnoTrabajadoOf(row)
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs text-foreground/70">
            {turno || <span className="text-muted-foreground/30">—</span>}
          </td>
        )
      }
      case "concepto": {
        const conceptoLabel = CONCEPTO_LABELS[row.concepto] ?? String(row.concepto)
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-xs text-foreground/80">
            {row.concepto !== 0 ? (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                {row.concepto} · {conceptoLabel}
              </span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </td>
        )
      }
      case "_desde":
      case "_hasta": {
        // Rango EXACTO donde aplica el concepto (no el turno completo). Una fila puede
        // tener varias franjas disjuntas (p. ej. nocturno 05:00–06:00 y 19:00–22:00):
        // se listan una por línea, alineadas entre las celdas Desde y Hasta.
        const ranges = recargoRangesOf(row)
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs text-foreground/70">
            {ranges.length === 0
              ? <span className="text-muted-foreground/30">—</span>
              : ranges.map((r, idx) => (
                  <div key={idx} className="leading-5">
                    {col.key === "_desde" ? r.desde : r.hasta}
                  </div>
                ))
            }
          </td>
        )
      }
      case "horasrecargo":
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums">
            {row.horasrecargo > 0
              ? <span className="font-semibold text-foreground">{row.horasrecargo}</span>
              : <span className="text-muted-foreground/30">—</span>
            }
          </td>
        )
      case "diferencia":
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums">
            {row.diferencia !== 0
              ? <span className="text-orange-600">{row.diferencia}</span>
              : <span className="text-muted-foreground/30">—</span>
            }
          </td>
        )
      case "_ausentismo": {
        const label = ausentismoLabel(module, row)
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center">
            {label ? (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                AUSENTISMO_STYLES[label] ?? "bg-muted text-muted-foreground ring-border"
              }`}>
                {label}
              </span>
            ) : <span className="text-muted-foreground/30">—</span>}
          </td>
        )
      }
      case "dia": {
        const diaLabel = row.festivo ? "Festivo" : (DIA_LABELS[row.dia] ?? row.dia)
        return (
          <td key={col.key} className="border-b border-border/50 px-3 py-2 text-center">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              row.festivo ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200" :
              row.dia === "D" ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200" :
              row.dia === "S" ? "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200" :
              "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
            }`}>
              {diaLabel}
            </span>
          </td>
        )
      }
      default:
        return <td key={col.key} className="border-b border-border/50 px-3 py-2" />
    }
  }

  return (
    <div className="space-y-3">
      {/* Selector de periodo / quincena */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Periodo:</span>
        <button
          type="button"
          onClick={() => applyQuincena(1)}
          disabled={!monthInfo.ym}
          className={[
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isQ1 ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted",
          ].join(" ")}
        >
          1ª quincena (1–15)
        </button>
        <button
          type="button"
          onClick={() => applyQuincena(2)}
          disabled={!monthInfo.ym}
          className={[
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isQ2 ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted",
          ].join(" ")}
        >
          2ª quincena (16–{monthInfo.lastDay})
        </button>

        <span className="mx-1 h-4 w-px bg-border" />

        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Desde
          <input
            type="date"
            value={periodFrom}
            max={periodTo || undefined}
            onChange={e => setPeriodFrom(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Hasta
          <input
            type="date"
            value={periodTo}
            min={periodFrom || undefined}
            onChange={e => setPeriodTo(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>

        {(periodFrom || periodTo) && (
          <button
            type="button"
            onClick={clearPeriod}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Limpiar
          </button>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {periodRows.length} en periodo
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar nombre, cédula o fecha..."
            className="h-8 w-64 rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Días sin recargo: ocultos por defecto, preferencia persistida por módulo. */}
          <button
            type="button"
            onClick={toggleSinRecargo}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {showSinRecargo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSinRecargo ? "Ocultar días sin recargo" : "Mostrar días sin recargo"}
            {!showSinRecargo && sinRecargoCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {sinRecargoCount}
              </span>
            )}
          </button>
          {/* Mostrar/ocultar columnas: preferencia persistida por módulo. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columnas
                {hiddenCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {hiddenCount} ocultas
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {COLUMN_GROUPS.map((group, gi) => {
                const cols = COLUMNS.filter((c) => c.group === group)
                if (!cols.length) return null
                return (
                  <div key={group}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group}
                    </DropdownMenuLabel>
                    {cols.map((col) => (
                      <DropdownMenuCheckboxItem
                        key={col.key}
                        checked={col.lockVisible || visibleCols[col.key] !== false}
                        disabled={col.lockVisible}
                        onCheckedChange={(checked) => toggleColumn(col.key, checked === true)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {col.label}
                        {col.lockVisible && (
                          <span className="ml-auto text-[10px] text-muted-foreground/60">siempre</span>
                        )}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={resetColumns} className="text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Restablecer columnas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="tabular-nums">{filtered.length} registros</span>
          <select
            value={pageSize}
            onChange={e => {
              const size = Number(e.target.value)
              setPageSize(size)
              persistPrefs({ pageSize: size })
              setPage(1)
            }}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / pág</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {!prefsLoaded ? (
        // Estado de carga mientras se consultan las preferencias guardadas
        // (localStorage hoy, BD mañana): visibilidad del estado del sistema.
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-12 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando preferencias guardadas...
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            {/* Header row */}
            <tr>
              {visibleColumns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={[
                    "border-b border-border bg-muted/30 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap",
                    col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left",
                    col.sortable ? "cursor-pointer select-none hover:text-foreground transition-colors" : "",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      sortCol === col.key
                        ? sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3 shrink-0" />
                          : <ChevronDown className="h-3 w-3 shrink-0" />
                        : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
            {/* Filter row */}
            <tr>
              {visibleColumns.map(col => (
                <th key={`f-${col.key}`} className="border-b border-border bg-background px-2 py-1">
                  {col.sortable ? (
                    <input
                      type="text"
                      value={filters[col.key] ?? ""}
                      onChange={e => setFilter(col.key, e.target.value)}
                      placeholder="—"
                      className="w-full min-w-[3.5rem] rounded border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[11px] text-foreground placeholder:text-muted-foreground/30 focus:border-ring focus:bg-background focus:outline-none"
                    />
                  ) : <span />}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {!showSinRecargo && sinRecargoCount > 0
                    ? `No hay días con recargo en este periodo. Hay ${sinRecargoCount} días sin recargo ocultos: usa "Mostrar días sin recargo" para verlos.`
                    : "No hay registros para mostrar."}
                </td>
              </tr>
            ) : paged.map((row, i) => {
              const isEven = i % 2 === 0

              return (
                <tr
                  key={`${row.medico}-${row.fecha}-${i}`}
                  className={`group transition-colors hover:bg-primary/5 ${isEven ? "" : "bg-muted/[0.06]"}`}
                >
                  {visibleColumns.map(col => renderCell(row, col))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Mostrando {paged.length > 0 ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} de {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={safePage === 1}
            className="rounded border border-border px-2 py-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            «
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded border border-border p-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageWindow().map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`min-w-[1.75rem] rounded border px-2 py-1 transition-colors ${
                safePage === p
                  ? "border-foreground bg-foreground font-semibold text-background"
                  : "border-border hover:bg-muted"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="rounded border border-border p-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={safePage === totalPages}
            className="rounded border border-border px-2 py-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
