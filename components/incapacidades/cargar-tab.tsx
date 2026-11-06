"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { leerKactus, type FilaKactus, type FilaRechazada, type VistaPreviaCarga } from "@/src/services/incapacidadesParser"
import { mensajeDe, pedir } from "./api"
import { fecha, fechaHora, numero, pesos } from "./formato"
import { useIncapacidades } from "./incapacidades-context"
import { Aviso, Indicador, Panel, Selector, Tabla, celda, celdaNum } from "./ui"

type Vista = VistaPreviaCarga & { resumen: { nuevas: number; duplicadas: number; rechazadas: number; paraRevisar: number }; puedeGuardar: boolean }
interface Lectura { archivo: string; filas: FilaKactus[]; rechazadas: FilaRechazada[] }
interface Carga { id: string; archivo: string; tipo: string; usuario: string; nuevas: number; duplicadas: number; rechazadas: number; para_revisar: number; created_at: string }

/**
 * RF-01. El Excel se lee AQUÍ (navegador): el diagnóstico se usa para marcar
 * posibles accidentes de tránsito y se descarta; al servidor solo viajan las
 * filas limpias. El servidor decide nuevas/duplicadas contra la BD.
 */
export function CargarTab() {
  const { datos, recargar, puede } = useIncapacidades()
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [vista, setVista] = useState<Vista | null>(null)
  const [eps, setEps] = useState<Record<string, string>>({})
  const [fondos, setFondos] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ nuevas: number; duplicadas: number; rechazadas: number; alertasNuevas: number } | null>(null)
  const [cargas, setCargas] = useState<Carga[]>([])
  const input = useRef<HTMLInputElement>(null)

  const cargarHistorial = useCallback(async () => {
    try { setCargas((await pedir<{ cargas: Carga[] }>("/api/incapacidades/cargas")).cargas) } catch { /* el historial es informativo */ }
  }, [])
  useEffect(() => {
    void (async () => { await cargarHistorial() })()
  }, [cargarHistorial])

  const previsualizar = async (l: Lectura, asignEps = eps, asignFondos = fondos) => {
    setOcupado("Revisando contra lo registrado…")
    try {
      setVista(await pedir<Vista>("/api/incapacidades/cargas", {
        method: "POST",
        body: { modo: "vista_previa", ...l, epsAsignadas: asignEps, fondosAsignados: asignFondos },
      }))
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(null)
    }
  }

  const leer = async (archivo: File) => {
    if (!datos) return
    setError(null); setVista(null); setResultado(null); setEps({}); setFondos({})
    setOcupado("Leyendo el archivo…")
    try {
      const r = leerKactus(new Uint8Array(await archivo.arrayBuffer()), archivo.name, datos.params)
      if (!r.ok) { setError(r.error); setLectura(null); return }
      const l = { archivo: archivo.name, filas: r.filas, rechazadas: r.rechazadas }
      setLectura(l)
      await previsualizar(l, {}, {})
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(null)
      if (input.current) input.current.value = ""
    }
  }

  const confirmar = async () => {
    if (!lectura) return
    setOcupado("Guardando…")
    try {
      const r = await pedir<{ nuevas: number; duplicadas: number; rechazadas: number; alertasNuevas: number }>("/api/incapacidades/cargas", {
        method: "POST",
        body: { modo: "confirmar", ...lectura, epsAsignadas: eps, fondosAsignados: fondos },
      })
      setResultado(r); setVista(null); setLectura(null)
      await Promise.all([recargar(), cargarHistorial()])
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(null)
    }
  }

  if (!datos) return null
  const reiniciar = () => { setLectura(null); setVista(null); setResultado(null); setError(null) }

  return (
    <div className="space-y-4">
      {puede("cargar_archivo") ? (
        <Panel titulo="Cargar reporte KactuS" descripcion="Archivo .xlsx de KactuS - KNmIncap. Nada se guarda hasta confirmar; la carga nunca modifica lo ya registrado.">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !ocupado) void leer(f) }}
            onClick={() => !ocupado && input.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/20 px-6 py-8 text-center transition-colors hover:bg-muted/30"
          >
            {ocupado ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />}
            <p className="text-sm font-medium">{ocupado ?? "Arrastra el archivo aquí o haz clic para seleccionarlo"}</p>
            <p className="text-xs text-muted-foreground">El diagnóstico se usa solo para sugerir accidentes de tránsito y no sale de tu navegador.</p>
            <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f) }} />
          </div>
        </Panel>
      ) : (
        <Aviso>Su rol no permite cargar archivos.</Aviso>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      {resultado && (
        <Aviso tipo="ok">
          Carga guardada: <strong>{resultado.nuevas} nuevas</strong>, {resultado.duplicadas} duplicadas, {resultado.rechazadas} rechazadas.
          {resultado.alertasNuevas > 0 && <> Se generaron <strong>{resultado.alertasNuevas} alerta(s)</strong> de días acumulados.</>}
        </Aviso>
      )}

      {vista && lectura && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador etiqueta="Nuevas" valor={vista.resumen.nuevas} tono="bien" detalle={pesos(vista.nuevas.reduce((s, n) => s + n.valorIncapacidad, 0))} />
            <Indicador etiqueta="Duplicadas" valor={vista.resumen.duplicadas} detalle="Ya registradas: no se tocan" />
            <Indicador etiqueta="Rechazadas" valor={vista.resumen.rechazadas} tono={vista.resumen.rechazadas ? "peligro" : "neutro"} />
            <Indicador etiqueta="Para revisar" valor={vista.resumen.paraRevisar} tono={vista.resumen.paraRevisar ? "alerta" : "neutro"} detalle="Se guardan igual, con la marca" />
          </div>

          {(vista.sinEps.length > 0 || vista.sinFondo.length > 0) && (
            <Panel titulo="Antes de guardar" descripcion="Asigne la EPS de las entidades que no están en la lista y el fondo de pensiones de quienes pasan del día 180.">
              <div className="space-y-3">
                {vista.sinEps.map((s) => (
                  <div key={s.fila} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-64">Fila {s.fila} · Nº {s.nroIncapacidad} · <em>{s.entidadKactus || "(sin entidad)"}</em></span>
                    <Selector className="w-56" vacio="Asignar EPS…" opciones={datos.params.listaEps} value={eps[String(s.fila)] ?? ""}
                      onChange={(e) => setEps({ ...eps, [String(s.fila)]: e.target.value })} />
                  </div>
                ))}
                {vista.sinFondo.map((s) => (
                  <div key={s.identificacion} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-64">{s.nombre} · {s.identificacion}</span>
                    <Selector className="w-56" vacio="Fondo de pensiones…" opciones={datos.params.listaFondos} value={fondos[s.identificacion] ?? ""}
                      onChange={(e) => setFondos({ ...fondos, [s.identificacion]: e.target.value })} />
                  </div>
                ))}
                <Button size="sm" variant="outline" disabled={Boolean(ocupado)} onClick={() => previsualizar(lectura)}>Aplicar asignaciones</Button>
              </div>
            </Panel>
          )}

          {vista.paraRevisar.length > 0 && (
            <Panel titulo="Para revisar">
              <Tabla encabezados={["Fila", "Colaborador", "Nº", "Motivo", ""]}>
                {vista.paraRevisar.map((p) => (
                  <tr key={`${p.fila}-${p.nroIncapacidad}`}>
                    <td className={celda}>{p.fila}</td>
                    <td className={celda}>{p.nombre}</td>
                    <td className={`${celda} font-mono text-xs`}>{p.nroIncapacidad}</td>
                    <td className="px-3 py-2">{p.motivos.join(" · ")}</td>
                    <td className={celda}>{p.esNueva ? "Nueva" : "Duplicada"}</td>
                  </tr>
                ))}
              </Tabla>
            </Panel>
          )}

          {vista.rechazadas.length > 0 && (
            <Panel titulo="Rechazadas (no se guardan)">
              <Tabla encabezados={["Fila", "Identificación", "Nº", "Motivo"]}>
                {vista.rechazadas.map((r) => (
                  <tr key={r.fila}><td className={celda}>{r.fila}</td><td className={celda}>{r.identificacion || "—"}</td><td className={celda}>{r.nroIncapacidad || "—"}</td><td className="px-3 py-2">{r.motivo}</td></tr>
                ))}
              </Tabla>
            </Panel>
          )}

          <Panel titulo={`Nuevas (${vista.nuevas.length})`}>
            <Tabla encabezados={["Colaborador", "Nº", "Tipo", "EPS", "Días", "Desde", "Hasta", "Valor"]} vacio="No hay incapacidades nuevas en el archivo.">
              {vista.nuevas.map((n) => (
                <tr key={`${n.identificacion}-${n.nroIncapacidad}`}>
                  <td className={celda}>{n.nombre}</td>
                  <td className={`${celda} font-mono text-xs`}>{n.nroIncapacidad}</td>
                  <td className={celda}>{n.tipo}{n.sugeridoTransito ? " · posible tránsito" : ""}</td>
                  <td className={celda}>{n.eps ?? "—"}</td>
                  <td className={celdaNum}>{n.dias} / {n.diasAcumulados}</td>
                  <td className={celda}>{fecha(n.fechaDesde)}</td>
                  <td className={celda}>{fecha(n.fechaHasta)}</td>
                  <td className={celdaNum}>{pesos(n.valorIncapacidad)}</td>
                </tr>
              ))}
            </Tabla>
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={confirmar} disabled={!vista.puedeGuardar || Boolean(ocupado)}>
              <Upload /> Confirmar y guardar {vista.resumen.nuevas} nueva(s)
            </Button>
            <Button variant="ghost" onClick={reiniciar}><RotateCcw /> Cancelar</Button>
            {!vista.puedeGuardar && <span className="text-sm text-amber-700">Falta asignar EPS o fondo y pulsar «Aplicar asignaciones».</span>}
          </div>
        </>
      )}

      <Panel titulo="Historial de cargas">
        <Tabla encabezados={["Fecha", "Archivo", "Tipo", "Usuario", "Nuevas", "Duplicadas", "Rechazadas", "Para revisar"]} vacio="Aún no hay cargas.">
          {cargas.map((c) => (
            <tr key={c.id}>
              <td className={celda}>{fechaHora(c.created_at)}</td>
              <td className={celda}>{c.archivo}</td>
              <td className={celda}>{c.tipo === "kactus" ? "KactuS" : c.tipo === "migracion" ? "Migración" : c.tipo}</td>
              <td className={celda}>{c.usuario}</td>
              <td className={celdaNum}>{numero(c.nuevas)}</td>
              <td className={celdaNum}>{numero(c.duplicadas)}</td>
              <td className={celdaNum}>{numero(c.rechazadas)}</td>
              <td className={celdaNum}>{numero(c.para_revisar)}</td>
            </tr>
          ))}
        </Tabla>
      </Panel>
    </div>
  )
}
