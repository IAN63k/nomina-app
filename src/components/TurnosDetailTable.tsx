"use client"

import { useState, useMemo, useCallback } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Search, FileDown } from "lucide-react"
import { SHIFT_COLOR_BY_CODE } from "@/src/constants/shifts"
import { ShiftCode } from "@/src/types/schedule"
import type { TurnoMedicoRow } from "@/src/services/turnosMedicosDb"
import { useEmpleados } from "@/contexts/empleados-context"


type Props = {
  rows: TurnoMedicoRow[]
}

type SortDir = "asc" | "desc"

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const CONCEPTO_LABELS: Record<number, string> = {
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

type Column = {
  key: string
  label: string
  sortable?: boolean
  align?: "left" | "right" | "center"
}

const COLUMNS: Column[] = [
  { key: "medico",       label: "Nombre",      sortable: true,  align: "left" },
  { key: "documento",    label: "Cédula",       sortable: true,  align: "left" },
  { key: "fecha",        label: "Fecha",        sortable: true,  align: "left" },
  { key: "turno_codigo", label: "Dig. Turno",   sortable: true,  align: "center" },
  { key: "_horario",     label: "Horario",      sortable: false, align: "center" },
  { key: "entrada",      label: "Hora Inicio",  sortable: true,  align: "center" },
  { key: "salida",       label: "Hora Fin",     sortable: true,  align: "center" },
  { key: "concepto",     label: "Concepto",     sortable: true,  align: "left" },
  { key: "horasrecargo", label: "Cantidad",     sortable: true,  align: "center" },
  { key: "dia",          label: "Día",          sortable: true,  align: "center" },
  // { key: "horas",        label: "Jornada",      sortable: true,  align: "center" },
  { key: "diferencia",   label: "Diferencia",   sortable: true,  align: "center" },
]

function getValue(row: TurnoMedicoRow, key: string): string | number {
  if (key === "_horario") {
    return row.entrada && row.salida ? `${row.entrada} – ${row.salida}` : ""
  }
  return (row as Record<string, unknown>)[key] as string | number ?? ""
}

export function TurnosDetailTable({ rows }: Props) {
  const { getCedulaByName } = useEmpleados()

  const exportTxt = useCallback(() => {
    const lines = rows
      .filter(r => r.horasrecargo > 0)
      .map(r => {
        const cedula = r.documento
          ? String(r.documento)
          : getCedulaByName(r.medico)
        return `${cedula}\t${r.concepto}\t${r.horasrecargo}`
      })
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = "recargos.txt"
    a.click()
    URL.revokeObjectURL(url)
  }, [rows])

  const [search, setSearch]               = useState("")
  const [filters, setFilters]             = useState<Record<string, string>>({})
  const [page, setPage]                   = useState(1)
  const [pageSize, setPageSize]           = useState(20)
  const [sortCol, setSortCol]             = useState<string>("fecha")
  const [sortDir, setSortDir]             = useState<SortDir>("asc")

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
    setPage(1)
  }

  const setFilter = (key: string, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }))
    setPage(1)
  }

  const filtered = useMemo(() => {
    let res = [...rows]

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
      res = res.filter(r => String(getValue(r, key)).toLowerCase().includes(q))
    }

    res.sort((a, b) => {
      const av = getValue(a, sortCol)
      const bv = getValue(b, sortCol)
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === "asc" ? cmp : -cmp
    })

    return res
  }, [rows, search, filters, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const pageWindow = () => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i).filter(p => p <= totalPages)
  }

  return (
    <div className="space-y-3">
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
          <button
            type="button"
            onClick={exportTxt}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <FileDown className="h-3.5 w-3.5" />
            Exportar TXT
          </button>
          <span className="tabular-nums">{filtered.length} registros</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / pág</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            {/* Header row */}
            <tr>
              {COLUMNS.map(col => (
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
              {COLUMNS.map(col => (
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
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No hay registros para mostrar.
                </td>
              </tr>
            ) : paged.map((row, i) => {
              const shiftColors = SHIFT_COLOR_BY_CODE[row.turno_codigo as ShiftCode] ?? {
                bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300",
              }
              const horario = row.entrada && row.salida ? `${row.entrada} – ${row.salida}` : "—"
              const conceptoLabel = CONCEPTO_LABELS[row.concepto] ?? String(row.concepto)
              const diaLabel = DIA_LABELS[row.dia] ?? row.dia
              const isEven = i % 2 === 0

              return (
                <tr
                  key={`${row.medico}-${row.fecha}-${i}`}
                  className={`group transition-colors hover:bg-primary/5 ${isEven ? "" : "bg-muted/[0.06]"}`}
                >
                  {/* Nombre */}
                  <td className="border-b border-border/50 px-3 py-2 font-medium text-foreground">
                    {row.medico}
                  </td>
                  {/* Cédula */}
                  <td className="border-b border-border/50 px-3 py-2 font-mono text-xs text-foreground/70">
                    {row.documento ?? <span className="text-muted-foreground/40">—</span>}
                  </td>
                  {/* Fecha */}
                  <td className="border-b border-border/50 px-3 py-2 font-mono text-xs text-foreground/80">
                    {formatDate(row.fecha)}
                  </td>
                  {/* Dig. Turno */}
                  <td className="border-b border-border/50 px-3 py-2 text-center">
                    {row.turno_codigo ? (
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded border font-mono text-[11px] font-bold ${shiftColors.bg} ${shiftColors.text} ${shiftColors.border}`}>
                        {row.turno_codigo}
                      </span>
                    ) : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  {/* Horario */}
                  <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs text-foreground/70">
                    {horario}
                  </td>
                  {/* Hora Inicio */}
                  <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs text-foreground/70">
                    {row.entrada ?? <span className="text-muted-foreground/30">—</span>}
                  </td>
                  {/* Hora Fin */}
                  <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs text-foreground/70">
                    {row.salida ?? <span className="text-muted-foreground/30">—</span>}
                  </td>
                  {/* Concepto */}
                  <td className="border-b border-border/50 px-3 py-2 text-xs text-foreground/80">
                    {row.concepto !== 0 ? (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                        {row.concepto} · {conceptoLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  {/* Cantidad (horasrecargo) */}
                  <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums">
                    {row.horasrecargo > 0
                      ? <span className="font-semibold text-foreground">{row.horasrecargo}</span>
                      : <span className="text-muted-foreground/30">—</span>
                    }
                  </td>
                  {/* Día */}
                  <td className="border-b border-border/50 px-3 py-2 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      row.dia === "D" ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-200" :
                      row.dia === "S" ? "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200" :
                      "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                    }`}>
                      {diaLabel}
                    </span>
                  </td>
                  {/* Jornada (horas) */}
                  {/* <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums text-foreground/80">
                    {row.horas}
                  </td> */}
                  {/* Diferencia */}
                  <td className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums">
                    {row.diferencia !== 0
                      ? <span className="text-orange-600">{row.diferencia}</span>
                      : <span className="text-muted-foreground/30">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
