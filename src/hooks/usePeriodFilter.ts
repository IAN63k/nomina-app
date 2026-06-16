"use client"

import { useMemo, useState } from "react"
import type { TurnoMedicoRow } from "@/src/services/turnosMedicosDb"

const pad2 = (n: number) => String(n).padStart(2, "0")

/**
 * Estado de filtrado por periodo/quincena compartido por la tabla de detalle (que
 * muestra el selector) y el menú de exportación (que vive arriba, junto a las
 * pestañas de mes). Ambos consumen el MISMO estado para que el export respete la
 * quincena elegida en la tabla.
 */
export function usePeriodFilter(rows: TurnoMedicoRow[]) {
  const [periodFrom, setPeriodFrom] = useState("")
  const [periodTo, setPeriodTo] = useState("")

  // Mes dominante de las filas. Un turno partido derrama su cola post-medianoche al día
  // siguiente; imputamos por la fecha de INICIO (`fechaInicio`) para que ese cruce cuente
  // en el mes/quincena del turno y no se pierda en el borde del mes.
  const monthInfo = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const ym = ((r.fechaInicio ?? r.fecha) ?? "").slice(0, 7)
      if (ym) counts.set(ym, (counts.get(ym) ?? 0) + 1)
    }
    let ym = ""
    let best = 0
    for (const [key, n] of counts) {
      if (n > best) { best = n; ym = key }
    }
    const [year, month] = ym ? ym.split("-").map(Number) : [0, 0]
    const lastDay = ym ? new Date(year, month, 0).getDate() : 31
    return { ym, year, month, lastDay }
  }, [rows])

  // Filas dentro del periodo seleccionado (base para la tabla y el export). Se imputa por
  // `fechaInicio` (día de inicio del turno) para que la cola post-medianoche de una Noche a
  // fin de mes/quincena salga en el período del turno y no quede fuera de rango.
  const periodRows = useMemo(() => {
    if (!periodFrom && !periodTo) return rows
    return rows.filter((r) => {
      const fecha = r.fechaInicio ?? r.fecha
      if (!fecha) return false
      if (periodFrom && fecha < periodFrom) return false
      if (periodTo && fecha > periodTo) return false
      return true
    })
  }, [rows, periodFrom, periodTo])

  const q1From = monthInfo.ym ? `${monthInfo.ym}-01` : ""
  const q1To   = monthInfo.ym ? `${monthInfo.ym}-15` : ""
  const q2From = monthInfo.ym ? `${monthInfo.ym}-16` : ""
  const q2To   = monthInfo.ym ? `${monthInfo.ym}-${pad2(monthInfo.lastDay)}` : ""
  const isQ1 = !!monthInfo.ym && periodFrom === q1From && periodTo === q1To
  const isQ2 = !!monthInfo.ym && periodFrom === q2From && periodTo === q2To

  // El rango de fechas es libre: el usuario puede elegir cualquier fecha (incluso
  // cruzando meses) sin que se acote al mes dominante. Las quincenas son solo atajos
  // basados en ese mes; el calendario no impone límites.
  const applyQuincena = (half: 1 | 2) => {
    if (!monthInfo.ym) return
    setPeriodFrom(half === 1 ? q1From : q2From)
    setPeriodTo(half === 1 ? q1To : q2To)
  }

  const clearPeriod = () => {
    setPeriodFrom("")
    setPeriodTo("")
  }

  // Sufijo descriptivo para el nombre del archivo (p. ej. "2026-06_01-15").
  const periodSuffix = () => {
    const day = (d: string) => d.slice(8, 10)
    if (periodFrom && periodTo && periodFrom.slice(0, 7) === periodTo.slice(0, 7)) {
      return `${periodFrom.slice(0, 7)}_${day(periodFrom)}-${day(periodTo)}`
    }
    if (periodFrom && periodTo) return `${periodFrom}_a_${periodTo}`
    if (periodFrom) return `desde_${periodFrom}`
    if (periodTo) return `hasta_${periodTo}`
    return monthInfo.ym || "completo"
  }

  return {
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
    periodSuffix,
  }
}

export type PeriodFilter = ReturnType<typeof usePeriodFilter>
