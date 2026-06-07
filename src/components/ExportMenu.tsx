"use client"

import { useCallback } from "react"
import { ChevronDown, FileDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEmpleados } from "@/contexts/empleados-context"
import type { PeriodFilter } from "@/src/hooks/usePeriodFilter"

type Props = { period: PeriodFilter }

/**
 * Menú de exportación de recargos (junto a las pestañas de mes). Respeta la
 * quincena/rango elegido en la tabla vía el mismo `usePeriodFilter`.
 *
 * Por ahora TXT y CSV generan el MISMO contenido (líneas `cédula\tconcepto\tcantidad`),
 * solo cambia la extensión. Pendiente: darle a CSV un formato re-importable para
 * que el usuario pueda volver a subir el archivo exportado (retrocompatibilidad).
 */
export function ExportMenu({ period }: Props) {
  const { getCedulaByName } = useEmpleados()

  const handleExport = useCallback(
    (format: "txt" | "csv") => {
      // La tabla puede mostrar un mismo (medico, fecha, concepto) partido en varias
      // filas por franja horaria; la nómina espera UNA línea por (medico, fecha,
      // concepto). Re-agregamos aquí antes de exportar.
      const aggregated = new Map<string, { cedula: string; concepto: number; horasrecargo: number }>()
      for (const r of period.periodRows) {
        if (r.horasrecargo <= 0) continue
        const cedula = r.documento ? String(r.documento) : getCedulaByName(r.medico)
        const key = `${r.medico}|${r.fecha}|${r.concepto}`
        const existing = aggregated.get(key)
        if (existing) existing.horasrecargo = Number((existing.horasrecargo + r.horasrecargo).toFixed(2))
        else aggregated.set(key, { cedula, concepto: r.concepto, horasrecargo: r.horasrecargo })
      }
      const lines = [...aggregated.values()].map((r) => `${r.cedula}\t${r.concepto}\t${r.horasrecargo}`)
      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `recargos_${period.periodSuffix()}.${format}`
      a.click()
      URL.revokeObjectURL(url)
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
        <DropdownMenuItem onClick={() => handleExport("txt")}>Exportar TXT</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("csv")}>Exportar CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
