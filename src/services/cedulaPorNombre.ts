/**
 * Cruce nombre → cédula contra el maestro de colaboradores (lo usan Recargos y
 * la exportación TXT).
 *
 * Las programaciones de turnos suelen traer el nombre abreviado ("Lucia
 * Rengifo") y el maestro el completo ("LUCIA RENGIFO SOLARTE"). Criterios,
 * en orden:
 *   1. Mismo nombre completo (sin tildes, mayúsculas ni espacios dobles).
 *   2. Mismas palabras en distinto orden ("Apellidos Nombres").
 *   3. Nombre abreviado: si tiene al menos 2 palabras y UN ÚNICO colaborador
 *      las contiene todas. Si hay dos o más candidatos no se asigna nada: es
 *      preferible "0000000000" a una cédula equivocada en el TXT de nómina.
 */

export const SIN_CEDULA = "0000000000"

export function normalizarNombre(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
}

const palabrasDe = (normalizado: string) => normalizado.split(" ").filter(Boolean)
const llaveTokens = (normalizado: string) => palabrasDe(normalizado).sort().join(" ")

export interface IndiceCedulas {
  buscar: (nombre: string) => string
}

export function crearIndiceCedulas(colaboradores: { nombre: string; cedula: string }[]): IndiceCedulas {
  const porNombre = new Map<string, string>()
  const porTokens = new Map<string, string>()
  const conPalabras: { palabras: Set<string>; cedula: string }[] = []

  for (const c of colaboradores) {
    const n = normalizarNombre(c.nombre)
    if (!n) continue
    if (!porNombre.has(n)) porNombre.set(n, c.cedula)
    const t = llaveTokens(n)
    if (!porTokens.has(t)) porTokens.set(t, c.cedula)
    conPalabras.push({ palabras: new Set(palabrasDe(n)), cedula: c.cedula })
  }

  const cache = new Map<string, string>()

  return {
    buscar(nombre: string): string {
      const q = normalizarNombre(nombre)
      if (!q) return SIN_CEDULA
      const enCache = cache.get(q)
      if (enCache) return enCache

      let cedula = porNombre.get(q) ?? porTokens.get(llaveTokens(q))
      if (!cedula) {
        const palabras = palabrasDe(q)
        if (palabras.length >= 2) {
          const candidatos = new Set(
            conPalabras.filter((c) => palabras.every((p) => c.palabras.has(p))).map((c) => c.cedula),
          )
          if (candidatos.size === 1) cedula = [...candidatos][0]
        }
      }
      const resultado = cedula ?? SIN_CEDULA
      cache.set(q, resultado)
      return resultado
    },
  }
}
