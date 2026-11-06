import * as XLSX from "xlsx"
import { CEDULA_VALIDA, type ColaboradorImportado } from "@/src/types/colaborador"

/**
 * Lectura del listado de colaboradores (Excel/CSV).
 *
 * Solo se extraen cédula, nombre (o Nombres + Apellidos), cargo, sede y fondo
 * de pensiones: aunque
 * el archivo traiga otras columnas (salario, dirección, teléfono…) nunca salen
 * de aquí.
 *
 * Los encabezados se reconocen por PALABRA completa, no por "contiene": así
 * "Dirección" no se confunde con "cc" ni "Control" con "rol".
 */

type Campo = "cedula" | "nombre" | "apellido" | "cargo" | "sede" | "fondo"

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const palabras = (h: string) => new Set(normalizar(h).split(" ").filter(Boolean))

/** Palabras que indican que una columna "Nombre …" no es el nombre de la persona. */
const NO_ES_PERSONA = ["centro", "empresa", "entidad", "concepto", "cargo", "sede", "area", "ips", "eps", "jefe", "banco", "fondo", "ciudad", "costo"]

const REGLAS: Record<Campo, (w: Set<string>) => boolean> = {
  // "Tipo de documento" o "Fecha expedición documento" no son la cédula.
  cedula: (w) =>
    ["cedula", "documento", "identificacion", "cc", "id", "nit"].some((p) => w.has(p)) &&
    !w.has("tipo") && !w.has("fecha") && !w.has("lugar"),
  nombre: (w) =>
    ["nombre", "nombres", "empleado", "colaborador", "medico", "funcionario", "trabajador"].some((p) => w.has(p)) &&
    !NO_ES_PERSONA.some((p) => w.has(p)) && !w.has("apellido") && !w.has("apellidos"),
  apellido: (w) => w.has("apellido") || w.has("apellidos"),
  cargo: (w) => w.has("cargo") || w.has("puesto"),
  // KactuS (KNmContr) trae la sede como "Descripción Clase Nómina".
  sede: (w) => w.has("sede") || w.has("ciudad") || w.has("regional") || (w.has("clase") && w.has("nomina")),
  fondo: (w) => (w.has("pension") || w.has("pensiones") || w.has("afp")) && !w.has("cesantias"),
}

/** La cédula se evalúa primero: "Id. Empleado" es cédula, no nombre. */
const ORDEN: Campo[] = ["cedula", "apellido", "cargo", "sede", "fondo", "nombre"]

function detectarColumnas(fila: unknown[]): Partial<Record<Campo, number>> {
  const cols: Partial<Record<Campo, number>> = {}
  const usadas = new Set<number>()
  for (const campo of ORDEN) {
    const i = fila.findIndex((h, idx) => !usadas.has(idx) && REGLAS[campo](palabras(String(h ?? ""))))
    if (i !== -1) {
      cols[campo] = i
      usadas.add(i)
    }
  }
  return cols
}

export interface ResultadoEmpleados {
  colaboradores: ColaboradorImportado[]
  /** Columnas reconocidas, para mostrar al usuario qué se leyó. */
  columnas: Partial<Record<Campo, string>>
  omitidas: { fila: number; motivo: string }[]
  /** Cédulas repetidas en el archivo (se conserva la última fila). */
  duplicadas: string[]
}

const texto = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ")

/** Núcleo puro: matriz de celdas (fila 0 = primera fila del archivo). */
export function parseEmpleadosMatriz(raw: unknown[][]): ResultadoEmpleados {
  if (!raw.length) throw new Error("El archivo está vacío.")

  let filaEnc = -1
  let cols: Partial<Record<Campo, number>> = {}
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const c = detectarColumnas(raw[i] ?? [])
    if (c.cedula !== undefined && c.nombre !== undefined) {
      filaEnc = i
      cols = c
      break
    }
  }

  if (filaEnc === -1) {
    // Sin encabezados: solo si la primera fila ya parece un dato (texto + número).
    const primera = raw[0] ?? []
    if (texto(primera[0]) && CEDULA_VALIDA.test(texto(primera[1]).replace(/\D/g, ""))) {
      filaEnc = -1
      cols = { nombre: 0, cedula: 1, cargo: 2 }
    } else {
      throw new Error("No se encontraron las columnas de Nombre y Cédula en las primeras 5 filas.")
    }
  }

  const encabezados = filaEnc >= 0 ? raw[filaEnc] : []
  const columnas: ResultadoEmpleados["columnas"] = {}
  for (const [campo, i] of Object.entries(cols) as [Campo, number][]) {
    columnas[campo] = filaEnc >= 0 ? texto(encabezados[i]) : `columna ${i + 1}`
  }

  const porCedula = new Map<string, ColaboradorImportado>()
  const duplicadas = new Set<string>()
  const omitidas: ResultadoEmpleados["omitidas"] = []

  for (let i = filaEnc + 1; i < raw.length; i++) {
    const row = raw[i] ?? []
    const celda = (c: Campo) => (cols[c] !== undefined ? texto(row[cols[c]!]) : "")
    const nombre = [celda("nombre"), celda("apellido")].filter(Boolean).join(" ")
    const cedulaCruda = celda("cedula")
    if (!nombre && !cedulaCruda) continue // fila vacía

    const cedula = cedulaCruda.replace(/\D/g, "")
    if (!nombre) { omitidas.push({ fila: i + 1, motivo: "Sin nombre" }); continue }
    if (!CEDULA_VALIDA.test(cedula)) { omitidas.push({ fila: i + 1, motivo: `Cédula inválida: "${cedulaCruda}"` }); continue }

    if (porCedula.has(cedula)) duplicadas.add(cedula)
    porCedula.set(cedula, {
      cedula,
      nombre,
      cargo: celda("cargo") || null,
      sede: celda("sede") || null,
      fondoPensiones: celda("fondo") || null,
    })
  }

  const colaboradores = [...porCedula.values()]
  if (!colaboradores.length) throw new Error("No se encontraron colaboradores válidos en el archivo.")
  return { colaboradores, columnas, omitidas, duplicadas: [...duplicadas] }
}

export async function parseEmpleadosFile(file: File): Promise<ResultadoEmpleados> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return parseEmpleadosMatriz(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true }))
}
