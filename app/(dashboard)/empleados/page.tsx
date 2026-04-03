"use client"

import { useRef, useState } from "react"
import { Upload, Trash2, Users, ShieldOff, FileSpreadsheet, AlertCircle } from "lucide-react"
import { useEmpleados, type Empleado } from "@/contexts/empleados-context"
import { parseEmpleadosFile } from "@/src/services/empleadosParser"

export default function EmpleadosPage() {
  const { empleados, loadEmpleados, clearEmpleados } = useEmpleados()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const data = await parseEmpleadosFile(file)
      loadEmpleados(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar el archivo.")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const filtered = empleados.filter((emp) =>
    !search.trim() ||
    emp.nombre.toLowerCase().includes(search.toLowerCase()) ||
    emp.cedula.includes(search) ||
    (emp.cargo ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Lista de empleados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carga el listado de colaboradores para asociar cédulas al generar reportes de recargos.
        </p>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium">Datos solo en sesión</p>
          <p className="text-amber-700/80">
            Esta información <strong>no se almacena en la base de datos</strong> ni en ningún
            servidor. Vive únicamente en tu navegador durante esta pestaña. Al cerrarla, se borra
            automáticamente.
          </p>
        </div>
      </div>

      {/* Upload area */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 transition-colors hover:border-foreground/30 hover:bg-muted/30"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {loading ? "Procesando archivo..." : "Arrastra tu Excel aquí o haz clic para seleccionar"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Columnas esperadas: <span className="font-mono">Nombre · Cédula · Cargo</span> (en cualquier orden)
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Employee table */}
      {empleados.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{empleados.length} colaboradores cargados</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-8 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => { clearEmpleados(); setSearch("") }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar lista
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border bg-muted/30 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Nombre
                  </th>
                  <th className="border-b border-border bg-muted/30 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Cédula
                  </th>
                  <th className="border-b border-border bg-muted/30 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Cargo
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((emp, i) => (
                    <tr key={`${emp.cedula}-${i}`} className={`hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/[0.06]" : ""}`}>
                      <td className="border-b border-border/50 px-4 py-2 font-medium text-foreground">
                        {emp.nombre}
                      </td>
                      <td className="border-b border-border/50 px-4 py-2 font-mono text-xs text-foreground/80">
                        {emp.cedula}
                      </td>
                      <td className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
                        {emp.cargo ?? <span className="text-muted-foreground/30">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!empleados.length && !error && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sin empleados cargados. Sube un archivo Excel para comenzar.
          </p>
        </div>
      )}
    </div>
  )
}
