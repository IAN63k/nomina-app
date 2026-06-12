"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, Sigma } from "lucide-react"
import type { TurnoMedicoRow } from "@/src/services/turnosMedicosDb"
import type { PeriodFilter } from "@/src/hooks/usePeriodFilter"

type Props = {
  /** Estado de periodo/quincena compartido con la tabla de detalle y el export. */
  period: PeriodFilter
  /** Etiqueta de la primera columna ("Médico", "Auxiliar"...). */
  nameLabel?: string
}

/**
 * Catálogo visual de conceptos: hue propio por concepto para la leyenda, los
 * encabezados y el tinte de intensidad de las celdas. Mismos códigos que el TXT.
 */
const CONCEPTOS: Array<{ code: number; label: string; group: "Hora extra" | "Recargo"; color: string }> = [
  { code: 31, label: "Extra Diurna",         group: "Hora extra", color: "#f59e0b" },
  { code: 32, label: "Extra Nocturna",       group: "Hora extra", color: "#6366f1" },
  { code: 33, label: "Extra Fest. Diurna",   group: "Hora extra", color: "#f97316" },
  { code: 34, label: "Extra Fest. Nocturna", group: "Hora extra", color: "#d946ef" },
  { code: 35, label: "Rec. Dom. Nocturno",   group: "Recargo",    color: "#8b5cf6" },
  { code: 36, label: "Rec. Lab. Nocturno",   group: "Recargo",    color: "#3b82f6" },
  { code: 39, label: "Horas Dominicales",    group: "Recargo",    color: "#f43f5e" },
]

const conceptoMeta = (code: number) =>
  CONCEPTOS.find((c) => c.code === code) ?? { code, label: `Concepto ${code}`, group: "Recargo" as const, color: "#64748b" }

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const fmtHoras = (n: number) =>
  n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

type PersonaTotals = {
  medico: string
  documento?: number
  porConcepto: Record<number, number>
  total: number
}

type SortCol = "medico" | "total" | number
type SortDir = "asc" | "desc"

export function ConceptosPorPersona({ period, nameLabel = "Persona" }: Props) {
  const { periodRows, periodFrom, periodTo, monthInfo } = period

  const [search, setSearch] = useState("")
  const [sortCol, setSortCol] = useState<SortCol>("total")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Agregado persona × concepto sobre las filas del periodo (mismo recorte de
  // quincena que la tabla de detalle). Solo cuentan filas con concepto y cantidad.
  const { personas, conceptosPresentes, totalGeneral, totalPorConcepto } = useMemo(() => {
    const byPersona = new Map<string, PersonaTotals>()
    const totalPorConcepto = new Map<number, number>()

    for (const row of periodRows as TurnoMedicoRow[]) {
      if (!row.concepto || row.horasrecargo <= 0) continue
      let p = byPersona.get(row.medico)
      if (!p) {
        p = { medico: row.medico, documento: row.documento ?? undefined, porConcepto: {}, total: 0 }
        byPersona.set(row.medico, p)
      }
      if (!p.documento && row.documento) p.documento = row.documento
      p.porConcepto[row.concepto] = (p.porConcepto[row.concepto] ?? 0) + row.horasrecargo
      p.total += row.horasrecargo
      totalPorConcepto.set(row.concepto, (totalPorConcepto.get(row.concepto) ?? 0) + row.horasrecargo)
    }

    const conceptosPresentes = [...totalPorConcepto.keys()].sort((a, b) => a - b)
    const personas = [...byPersona.values()]
    const totalGeneral = personas.reduce((acc, p) => acc + p.total, 0)
    return { personas, conceptosPresentes, totalGeneral, totalPorConcepto }
  }, [periodRows])

  // Máximos para escalar el tinte de intensidad por columna y la barra del total.
  const colMax = useMemo(() => {
    const max = new Map<number, number>()
    for (const p of personas) {
      for (const code of conceptosPresentes) {
        const v = p.porConcepto[code] ?? 0
        if (v > (max.get(code) ?? 0)) max.set(code, v)
      }
    }
    return max
  }, [personas, conceptosPresentes])

  const maxTotal = useMemo(
    () => personas.reduce((acc, p) => Math.max(acc, p.total), 0),
    [personas]
  )

  const visiblePersonas = useMemo(() => {
    let res = personas
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      res = res.filter(
        (p) => p.medico.toLowerCase().includes(q) || (p.documento?.toString() ?? "").includes(q)
      )
    }
    return [...res].sort((a, b) => {
      let cmp: number
      if (sortCol === "medico") cmp = a.medico.localeCompare(b.medico)
      else if (sortCol === "total") cmp = a.total - b.total
      else cmp = (a.porConcepto[sortCol] ?? 0) - (b.porConcepto[sortCol] ?? 0)
      if (cmp === 0) cmp = a.medico.localeCompare(b.medico)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [personas, search, sortCol, sortDir])

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortCol(col)
      setSortDir(col === "medico" ? "asc" : "desc")
    }
  }

  const sortIcon = (col: SortCol) =>
    sortCol === col
      ? sortDir === "asc"
        ? <ChevronUp className="h-3 w-3 shrink-0" />
        : <ChevronDown className="h-3 w-3 shrink-0" />
      : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />

  const periodoLabel =
    periodFrom || periodTo
      ? `${periodFrom || "inicio"} → ${periodTo || "fin"}`
      : monthInfo.ym
        ? `mes ${monthInfo.ym}`
        : "todos los datos"

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Glow decorativo: ancla visual de la sección sin robar contraste. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
      />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            <Sigma className="h-3.5 w-3.5" />
            Totales por persona
          </p>
          <p className="text-sm text-foreground/70">
            Horas acumuladas por concepto en el periodo ({periodoLabel})
          </p>
        </div>
        <div className="flex items-baseline gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2">
          <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {fmtHoras(totalGeneral)}
          </span>
          <span className="text-xs text-muted-foreground">
            h · {personas.length} {personas.length === 1 ? "persona" : "personas"}
          </span>
        </div>
      </div>

      {conceptosPresentes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No hay conceptos liquidados en este periodo.
        </div>
      ) : (
        <>
          {/* Leyenda de conceptos: cada chip muestra el total global y ordena su columna. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {conceptosPresentes.map((code) => {
              const meta = conceptoMeta(code)
              const active = sortCol === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSort(code)}
                  title={`${meta.group} — ordenar por ${meta.label}`}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                    active
                      ? "border-foreground/40 bg-foreground/5 text-foreground shadow-sm"
                      : "border-border bg-background text-foreground/70 hover:bg-muted",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="font-mono font-bold">{code}</span>
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="font-mono font-semibold tabular-nums" style={{ color: meta.color }}>
                    {fmtHoras(totalPorConcepto.get(code) ?? 0)} h
                  </span>
                </button>
              )
            })}
          </div>

          {/* Buscador */}
          <div className="relative mb-3 w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre o cédula..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Matriz persona × concepto */}
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-border bg-background shadow-sm">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th
                    onClick={() => handleSort("medico")}
                    className="cursor-pointer select-none border-b border-border bg-muted px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1">{nameLabel} {sortIcon("medico")}</span>
                  </th>
                  {conceptosPresentes.map((code) => {
                    const meta = conceptoMeta(code)
                    return (
                      <th
                        key={code}
                        onClick={() => handleSort(code)}
                        title={`${meta.group} — ${meta.label}`}
                        className="cursor-pointer select-none whitespace-nowrap border-b border-border bg-muted px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                        style={{ boxShadow: `inset 0 -2px 0 ${meta.color}` }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="font-mono text-[11px] font-bold" style={{ color: meta.color }}>{code}</span>
                          <span className="hidden lg:inline normal-case tracking-normal">{meta.label}</span>
                          {sortIcon(code)}
                        </span>
                      </th>
                    )
                  })}
                  <th
                    onClick={() => handleSort("total")}
                    className="cursor-pointer select-none border-b border-border bg-muted px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1">Total {sortIcon("total")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePersonas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={conceptosPresentes.length + 2}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Sin resultados para esa búsqueda.
                    </td>
                  </tr>
                ) : (
                  visiblePersonas.map((p, i) => (
                    <tr key={p.medico} className={`group transition-colors hover:bg-primary/5 ${i % 2 === 0 ? "" : "bg-muted/[0.06]"}`}>
                      <td className="border-b border-border/50 px-3 py-2">
                        <p className="font-medium leading-tight text-foreground">{p.medico}</p>
                        {p.documento ? (
                          <p className="font-mono text-[10px] leading-tight text-muted-foreground/70">{p.documento}</p>
                        ) : null}
                      </td>
                      {conceptosPresentes.map((code) => {
                        const v = p.porConcepto[code] ?? 0
                        const meta = conceptoMeta(code)
                        const max = colMax.get(code) ?? 0
                        // Tinte proporcional al máximo de la columna: el patrón de
                        // intensidades se lee de un vistazo sin comparar números.
                        const alpha = v > 0 && max > 0 ? 0.08 + 0.3 * (v / max) : 0
                        return (
                          <td
                            key={code}
                            className="border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums"
                            style={alpha ? { backgroundColor: rgba(meta.color, alpha) } : undefined}
                          >
                            {v > 0 ? (
                              <span className="font-semibold text-foreground">{fmtHoras(v)}</span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="border-b border-border/50 px-3 py-2 text-right">
                        <span className="font-mono text-xs font-bold tabular-nums text-foreground">{fmtHoras(p.total)}</span>
                        <div className="mt-1 ml-auto h-1 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary transition-[width] duration-300"
                            style={{ width: `${maxTotal > 0 ? Math.max(4, (p.total / maxTotal) * 100) : 0}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {visiblePersonas.length > 0 ? (
                <tfoot className="sticky bottom-0 z-10">
                  <tr>
                    <td className="border-t-2 border-border bg-muted px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Total general
                    </td>
                    {conceptosPresentes.map((code) => (
                      <td key={code} className="border-t-2 border-border bg-muted px-3 py-2 text-center font-mono text-xs font-bold tabular-nums text-foreground">
                        {fmtHoras(totalPorConcepto.get(code) ?? 0)}
                      </td>
                    ))}
                    <td className="border-t-2 border-border bg-muted px-3 py-2 text-right font-mono text-xs font-bold tabular-nums text-foreground">
                      {fmtHoras(totalGeneral)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
