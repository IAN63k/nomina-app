/**
 * Lectura de la hoja "Seguimiento" del libro "Seguimiento de incapacidades
 * 2026" (encabezados en la fila 4). Base de la migración inicial (RF-11) y
 * de las pruebas que comparan la app con el Excel.
 *
 * Solo convierte filas a objetos; las reglas de migración (fondo de
 * pensiones, estados) se aplican aparte.
 */

import * as XLSX from "xlsx"
import { aFechaISO, aNumero, aTexto } from "@/src/services/incapacidadesParser"
import type { FechaISO, Incapacidad } from "@/src/types/incapacidad"

export const HOJA_SEGUIMIENTO = "Seguimiento"
const FILA_ENCABEZADOS = 4

const COLUMNAS = {
  identificacion: "Identificación",
  nombre: "Nombre del colaborador",
  nro: "Nº incapacidad",
  eps: "EPS",
  dias: "Días",
  prorroga: "¿Es prórroga?",
  diasAcumulados: "Días acumulados",
  fechaDesde: "Fecha desde",
  fechaHasta: "Fecha hasta",
  radNomina: "Fecha radicación nómina",
  radEps: "Fecha radicación EPS",
  valor: "Valor incapacidad",
  estado: "Estado",
  fechaPago: "Fecha de pago",
  valorPagado: "Valor pagado",
  causal: "Causal de no pago",
  nroGestion: "Nº gestión (PQRD / radicado)",
  fechaGestion: "Fecha última gestión",
  accion: "Acción / observación",
  responsable: "Responsable",
  tipo: "Tipo de incapacidad",
} as const

export interface FilaLibro {
  fila: number
  inc: Incapacidad
  valorPagado: number | null
  fechaPago: FechaISO | null
  nroGestion: string | null
  fechaGestion: FechaISO | null
  /** Valores calculados del Excel, solo para comparar con el motor. */
  excel: { saldo: number | null; alerta: string | null }
}

export type ResultadoLibro = { ok: true; filas: FilaLibro[] } | { ok: false; error: string }

export function leerLibroSeguimiento(data: ArrayBuffer | Uint8Array): ResultadoLibro {
  const wb = XLSX.read(data, { type: "array", cellDates: true })
  const ws = wb.Sheets[HOJA_SEGUIMIENTO]
  if (!ws) return { ok: false, error: `El libro no tiene la hoja "${HOJA_SEGUIMIENTO}".` }

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
  const enc = (matriz[FILA_ENCABEZADOS - 1] ?? []).map((v) => aTexto(v))
  const idx = Object.fromEntries(
    Object.entries(COLUMNAS).map(([k, titulo]) => [k, enc.indexOf(titulo)]),
  ) as Record<keyof typeof COLUMNAS, number>
  const faltan = Object.entries(idx).filter(([, i]) => i === -1).map(([k]) => COLUMNAS[k as keyof typeof COLUMNAS])
  if (faltan.length) return { ok: false, error: `Faltan columnas en Seguimiento: ${faltan.join(", ")}` }
  const saldoIdx = enc.indexOf("Saldo pendiente")
  const alertaIdx = enc.indexOf("Alerta")

  const filas: FilaLibro[] = []
  for (let r = FILA_ENCABEZADOS; r < matriz.length; r++) {
    const row = matriz[r] ?? []
    const c = (k: keyof typeof COLUMNAS) => row[idx[k]]
    const identificacion = aTexto(c("identificacion"))
    if (!identificacion) continue

    const dias = aNumero(c("dias")) ?? 0
    filas.push({
      fila: r + 1,
      inc: {
        identificacion,
        nroIncapacidad: aTexto(c("nro")),
        nombre: aTexto(c("nombre")),
        concepto: null,
        tipo: aTexto(c("tipo")) || "Enfermedad general",
        esProrroga: aTexto(c("prorroga")).toLowerCase().startsWith("s"),
        dias,
        diasAcumulados: aNumero(c("diasAcumulados")) ?? dias,
        fechaDesde: aFechaISO(c("fechaDesde")) ?? "",
        fechaHasta: aFechaISO(c("fechaHasta")) ?? "",
        fechaRadicacionNomina: aFechaISO(c("radNomina")),
        fechaRadicacionEps: aFechaISO(c("radEps")),
        valorIncapacidad: Math.round(aNumero(c("valor")) ?? 0),
        eps: aTexto(c("eps")) || null,
        valorFondoManual: null,
        estado: aTexto(c("estado")) || "Radicada",
        causalNoPago: aTexto(c("causal")) || null,
        responsable: aTexto(c("responsable")) || null,
        observacion: aTexto(c("accion")) || null,
        finLactancia: null,
        sugeridoTransito: false,
        paraRevisar: [],
        origen: "Migración Seguimiento 2026",
      },
      valorPagado: aNumero(c("valorPagado")),
      fechaPago: aFechaISO(c("fechaPago")),
      nroGestion: aTexto(c("nroGestion")) || null,
      fechaGestion: aFechaISO(c("fechaGestion")),
      excel: {
        saldo: saldoIdx >= 0 ? aNumero(row[saldoIdx]) : null,
        alerta: alertaIdx >= 0 ? aTexto(row[alertaIdx]) || null : null,
      },
    })
  }
  return { ok: true, filas }
}
