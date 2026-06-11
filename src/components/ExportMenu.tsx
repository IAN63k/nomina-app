"use client"

import { useCallback } from "react"
import { ChevronDown, FileDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEmpleados } from "@/contexts/empleados-context"
import type { PeriodFilter } from "@/src/hooks/usePeriodFilter"
import type { TurnoMedicoRow } from "@/src/services/turnosMedicosDb"

type Props = { period: PeriodFilter }

type ExportFormat = "txt" | "csv"

type GetCedula = (name: string) => string

/**
 * Líneas de nómina `cédula\tconcepto\tcantidad` para un conjunto de filas. La tabla
 * puede mostrar un mismo (medico, fecha, concepto) partido en varias filas por franja
 * horaria; aquí se re-agrega a UNA línea por (medico, fecha, concepto). Solo cuenta el
 * recargo (> 0).
 */
function buildLines(rows: TurnoMedicoRow[], getCedula: GetCedula): string[] {
  const aggregated = new Map<string, { cedula: string; concepto: number; horasrecargo: number }>()
  for (const r of rows) {
    if (r.horasrecargo <= 0) continue
    const cedula = r.documento ? String(r.documento) : getCedula(r.medico)
    const key = `${r.medico}|${r.fecha}|${r.concepto}`
    const existing = aggregated.get(key)
    if (existing) existing.horasrecargo = Number((existing.horasrecargo + r.horasrecargo).toFixed(2))
    else aggregated.set(key, { cedula, concepto: r.concepto, horasrecargo: r.horasrecargo })
  }
  return [...aggregated.values()].map((r) => `${r.cedula}\t${r.concepto}\t${r.horasrecargo}`)
}

/** Nombre de archivo seguro a partir del nombre (y cédula) de la persona. */
function fileLabel(medico: string, cedula: string): string {
  const base = `${medico}${cedula ? `_${cedula}` : ""}`
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .replace(/\s+/g, "_")
  return base ? base.slice(0, 120) : "sin_nombre"
}

function download(content: BlobPart, filename: string, mime = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Menú de exportación de recargos (junto a las pestañas de mes). Respeta la
 * quincena/rango elegido en la tabla vía el mismo `usePeriodFilter`.
 *
 * - Combinado: un único archivo con todas las personas del periodo.
 * - Por persona: un archivo por persona, empacados en un ZIP.
 *
 * Por ahora TXT y CSV generan el MISMO contenido (líneas `cédula\tconcepto\tcantidad`),
 * solo cambia la extensión. Pendiente: darle a CSV un formato re-importable.
 */
export function ExportMenu({ period }: Props) {
  const { getCedulaByName } = useEmpleados()

  // Exportación combinada (todas las personas en un archivo) — comportamiento previo.
  const handleExport = useCallback(
    (format: ExportFormat) => {
      const lines = buildLines(period.periodRows, getCedulaByName)
      download(lines.join("\n"), `recargos_${period.periodSuffix()}.${format}`)
    },
    [period, getCedulaByName]
  )

  // Exportación por persona: un archivo por persona dentro de un ZIP.
  const handleExportPerPerson = useCallback(
    async (format: ExportFormat) => {
      // Agrupar las filas del periodo por persona.
      const byPerson = new Map<string, TurnoMedicoRow[]>()
      for (const r of period.periodRows) {
        const list = byPerson.get(r.medico)
        if (list) list.push(r)
        else byPerson.set(r.medico, [r])
      }

      const { default: JSZip } = await import("jszip")
      const zip = new JSZip()
      const used = new Map<string, number>()
      let archivos = 0

      for (const [medico, rows] of byPerson) {
        const lines = buildLines(rows, getCedulaByName)
        if (!lines.length) continue // persona sin recargo en el periodo
        const cedula = rows.find((r) => r.documento)?.documento
          ? String(rows.find((r) => r.documento)!.documento)
          : getCedulaByName(medico)
        let name = fileLabel(medico, cedula)
        const prev = used.get(name) ?? 0
        used.set(name, prev + 1)
        if (prev > 0) name = `${name}_${prev + 1}`
        zip.file(`${name}.${format}`, lines.join("\n"))
        archivos += 1
      }

      if (archivos === 0) return
      const blob = await zip.generateAsync({ type: "blob" })
      download(blob, `recargos_por_persona_${period.periodSuffix()}.zip`, "application/zip")
    },
    [period, getCedulaByName]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
        >
          <FileDown className="h-4 w-4" />
          Exportar
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Todas las personas</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExport("txt")}>Exportar TXT</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("csv")}>Exportar CSV</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Por persona (ZIP)</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExportPerPerson("txt")}>TXT por persona</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExportPerPerson("csv")}>CSV por persona</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
