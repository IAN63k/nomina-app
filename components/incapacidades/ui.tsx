"use client"

import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react"
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react"
import type { AlertaCobro } from "@/src/types/incapacidad"

/** Piezas visuales compartidas por las pestañas de Incapacidades. */

export function Panel({ titulo, descripcion, acciones, children, className = "" }: {
  titulo?: ReactNode; descripcion?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-xl border bg-card p-5 ${className}`}>
      {(titulo || acciones) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Indicador({ etiqueta, valor, detalle, tono = "neutro" }: {
  etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: "neutro" | "bien" | "alerta" | "peligro"
}) {
  const color = { neutro: "", bien: "text-emerald-700 dark:text-emerald-400", alerta: "text-amber-700 dark:text-amber-400", peligro: "text-red-700 dark:text-red-400" }[tono]
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  )
}

const COLOR_ALERTA: Record<AlertaCobro, string> = {
  "Cerrada": "bg-muted text-muted-foreground",
  "Al día": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "En mora": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  "Pago menor al valor": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "Rechazada: gestionar": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  "Riesgo prescripción": "bg-red-600 text-white",
}

export function EtiquetaAlerta({ alerta }: { alerta: AlertaCobro }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ALERTA[alerta]}`}>{alerta}</span>
}

export function Etiqueta({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "alerta" | "peligro" | "bien" | "info" }) {
  const c = {
    neutro: "bg-muted text-muted-foreground",
    alerta: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    peligro: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    bien: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  }[tono]
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>
}

// Sin ancho fijo: dentro de <Campo> ocupan todo el ancho; fuera, el que indique className.
const CONTROL =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"

export function Selector({ opciones, vacio, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  opciones: (string | { valor: string; texto: string })[]; vacio?: string
}) {
  return (
    <select {...props} className={`${CONTROL} ${props.className ?? ""}`}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => {
        const { valor, texto } = typeof o === "string" ? { valor: o, texto: o } : o
        return <option key={valor} value={valor}>{texto}</option>
      })}
    </select>
  )
}

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />
}

export function AreaTexto(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${CONTROL} h-auto py-2 ${props.className ?? ""}`} />
}

export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm [&_input:not([type=checkbox])]:w-full [&_select]:w-full [&_textarea]:w-full ${className}`}>
      <span className="font-medium">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  )
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok" | "alerta"; children: ReactNode }) {
  const estilos = {
    info: ["border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200", Info],
    error: ["border-destructive/30 bg-destructive/5 text-destructive", AlertCircle],
    ok: ["border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200", CheckCircle2],
    alerta: ["border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200", AlertCircle],
  } as const
  const [clase, Icono] = estilos[tipo]
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${clase}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Cargando({ texto = "Cargando..." }: { texto?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {texto}
    </p>
  )
}

/** Tabla simple con estilo del proyecto. */
export function Tabla({ encabezados, children, vacio = "Sin datos.", columnas }: {
  encabezados: ReactNode[]; children: ReactNode; vacio?: string; columnas?: number
}) {
  const hayFilas = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {encabezados.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {hayFilas ? children : (
            <tr><td colSpan={columnas ?? encabezados.length} className="px-3 py-6 text-center text-muted-foreground">{vacio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const celda = "whitespace-nowrap px-3 py-2"
export const celdaNum = "whitespace-nowrap px-3 py-2 text-right tabular-nums"
