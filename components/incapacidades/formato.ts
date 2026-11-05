/** Formatos del módulo (RNF-05): fechas dd/mm/aaaa y pesos sin decimales. */

const PESOS = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })

export const pesos = (n: number | null | undefined) => (n === null || n === undefined ? "—" : PESOS.format(n))

export function fecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

export const porcentaje = (x: number) => `${(x * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`

export const numero = (n: number) => n.toLocaleString("es-CO")

/** Texto sin tildes ni mayúsculas, para buscar. */
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
