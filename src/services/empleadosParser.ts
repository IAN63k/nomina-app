import * as XLSX from "xlsx"
import type { Empleado } from "@/contexts/empleados-context"

const NOMBRE_ALIASES  = ["nombre", "name", "empleado", "colaborador", "medico", "médico"]
const CEDULA_ALIASES  = ["cedula", "cédula", "documento", "id", "identificacion", "identificación", "cc"]
const CARGO_ALIASES   = ["cargo", "puesto", "position", "rol", "role"]

function matchAlias(header: string, aliases: string[]): boolean {
  const h = header.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return aliases.some((a) => h.includes(a))
}

export async function parseEmpleadosFile(file: File): Promise<Empleado[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })

  if (!raw.length) throw new Error("El archivo está vacío.")

  // Buscar la fila de encabezados (primera fila con al menos 2 celdas no vacías)
  let headerRow = -1
  let nombreCol = -1
  let cedulaCol = -1
  let cargoCol  = -1

  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i].map(String)
    const ni = row.findIndex((h) => matchAlias(h, NOMBRE_ALIASES))
    const ci = row.findIndex((h) => matchAlias(h, CEDULA_ALIASES))
    if (ni !== -1 && ci !== -1) {
      headerRow = i
      nombreCol = ni
      cedulaCol = ci
      cargoCol  = row.findIndex((h) => matchAlias(h, CARGO_ALIASES))
      break
    }
  }

  if (headerRow === -1) {
    // Sin encabezados reconocibles → asumir col 0=nombre, col 1=cédula, col 2=cargo
    headerRow = 0
    nombreCol = 0
    cedulaCol = 1
    cargoCol  = 2
  }

  const empleados: Empleado[] = []

  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i]
    const nombre = String(row[nombreCol] ?? "").trim()
    const cedula = String(row[cedulaCol] ?? "").trim().replace(/\D/g, "") // solo dígitos
    if (!nombre || !cedula) continue

    empleados.push({
      nombre,
      cedula,
      cargo: cargoCol >= 0 ? String(row[cargoCol] ?? "").trim() : undefined,
    })
  }

  if (!empleados.length) throw new Error("No se encontraron empleados válidos en el archivo.")

  return empleados
}
