"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Users, ShieldCheck, FileSpreadsheet, AlertCircle, CheckCircle2, LogIn, Loader2 } from "lucide-react"
import { useEmpleados, type ResumenImportacion } from "@/contexts/empleados-context"
import { useAuth } from "@/contexts/auth-context"
import { puede } from "@/src/lib/permisos"

const CAMPOS_LEIDOS: Record<string, string> = {
  cedula: "Cédula",
  nombre: "Nombre",
  apellido: "Apellidos",
  cargo: "Cargo",
  sede: "Sede",
  fondo: "Fondo de pensiones",
}

export default function EmpleadosPage() {
  const { empleados, fondos, estado, error: errorCarga, importarArchivo, actualizar } = useEmpleados()
  const { user, logout } = useAuth()
  const router = useRouter()
  const puedeEditar = puede(user?.rol, "editar_colaboradores")

  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setResumen(null)
    setSubiendo(true)
    try {
      setResumen(await importarArchivo(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar el archivo.")
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const cambiarFondo = async (cedula: string, fondo: string) => {
    setError(null)
    setGuardando(cedula)
    try {
      await actualizar(cedula, { fondoPensiones: fondo || null })
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el fondo.")
    } finally {
      setGuardando(null)
    }
  }

  const reautenticar = async () => {
    await logout()
    router.push("/login")
  }

  const q = search.trim().toLowerCase()
  const filtered = empleados.filter(
    (emp) =>
      !q ||
      emp.nombre.toLowerCase().includes(q) ||
      emp.cedula.includes(q) ||
      (emp.cargo ?? "").toLowerCase().includes(q) ||
      (emp.sede ?? "").toLowerCase().includes(q),
  )

  const th = "border-b border-border bg-muted/30 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
  const vacio = <span className="text-muted-foreground/30">—</span>

  return (
    <div className="py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Lista de empleados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Maestro de colaboradores compartido por Recargos (cédula para el TXT), Vacaciones e Incapacidades
          (fondo de pensiones).
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium">Guardado en la base de datos de la app</p>
          <p className="text-muted-foreground">
            Solo se guardan cédula, nombre, cargo, sede y fondo de pensiones. <strong>Nunca salarios</strong>{" "}
            ni otras columnas del archivo. El acceso exige sesión iniciada.
          </p>
        </div>
      </div>

      {estado === "sin_sesion" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Tu sesión venció o es de una versión anterior. Inicia sesión de nuevo para ver el listado.</span>
          <button
            type="button"
            onClick={reautenticar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
          >
            <LogIn className="h-3.5 w-3.5" />
            Iniciar sesión
          </button>
        </div>
      )}

      {puedeEditar && estado !== "sin_sesion" && (
        <div
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file && !subiendo) handleFile(file)
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !subiendo && inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 transition-colors hover:border-foreground/30 hover:bg-muted/30"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
            {subiendo ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {subiendo ? "Guardando listado..." : "Arrastra tu Excel aquí o haz clic para seleccionar"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Columnas: <span className="font-mono">Nombre (o Nombres + Apellidos) · Cédula · Cargo · Sede · Pensión</span>.
              Agrega los nuevos y actualiza los existentes; no borra a nadie.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>
      )}

      {(error || (estado === "error" && errorCarga)) && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error ?? errorCarga}
        </div>
      )}

      {resumen && (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Listado guardado: {resumen.nuevos} nuevos · {resumen.actualizados} actualizados · {resumen.sin_cambios} sin cambios
          </p>
          <p className="text-emerald-800/80">
            Columnas leídas:{" "}
            {Object.entries(resumen.lectura.columnas)
              .map(([campo, encabezado]) => `${CAMPOS_LEIDOS[campo] ?? campo} ← "${encabezado}"`)
              .join(" · ")}
          </p>
          {resumen.lectura.omitidas.length > 0 && (
            <p className="text-amber-800">
              {resumen.lectura.omitidas.length} fila(s) omitidas:{" "}
              {resumen.lectura.omitidas.slice(0, 5).map((o) => `fila ${o.fila} (${o.motivo})`).join(", ")}
              {resumen.lectura.omitidas.length > 5 ? "…" : ""}
            </p>
          )}
          {resumen.fondos_no_reconocidos.length > 0 && (
            <p className="text-amber-800">
              Fondos no reconocidos (no se guardaron): {resumen.fondos_no_reconocidos.join(", ")}
            </p>
          )}
          {resumen.lectura.duplicadas.length > 0 && (
            <p className="text-amber-800">
              Cédulas repetidas en el archivo (se tomó la última fila): {resumen.lectura.duplicadas.join(", ")}
            </p>
          )}
        </div>
      )}

      {estado === "cargando" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando colaboradores...
        </p>
      )}

      {estado === "listo" && empleados.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{empleados.length} colaboradores</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-8 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={th}>Nombre</th>
                  <th className={th}>Cédula</th>
                  <th className={th}>Cargo</th>
                  <th className={th}>Sede</th>
                  <th className={th}>Fondo de pensiones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((emp, i) => (
                    <tr key={emp.cedula} className={`hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/[0.06]" : ""}`}>
                      <td className="border-b border-border/50 px-4 py-2 font-medium text-foreground">{emp.nombre}</td>
                      <td className="border-b border-border/50 px-4 py-2 font-mono text-xs text-foreground/80">{emp.cedula}</td>
                      <td className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">{emp.cargo || vacio}</td>
                      <td className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">{emp.sede || vacio}</td>
                      <td className="border-b border-border/50 px-4 py-1.5 text-xs">
                        {puedeEditar ? (
                          <select
                            aria-label={`Fondo de pensiones de ${emp.nombre}`}
                            value={emp.fondoPensiones ?? ""}
                            disabled={guardando === emp.cedula}
                            onChange={(e) => cambiarFondo(emp.cedula, e.target.value)}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          >
                            <option value="">Sin registrar</option>
                            {fondos.map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        ) : (
                          emp.fondoPensiones || vacio
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {estado === "listo" && !empleados.length && !error && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sin colaboradores guardados. {puedeEditar ? "Sube un archivo Excel para comenzar." : ""}
          </p>
        </div>
      )}
    </div>
  )
}
