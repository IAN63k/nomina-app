"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ParametrosIncapacidades } from "@/src/types/incapacidad"
import { mensajeDe, pedir } from "./api"
import { DetalleIncapacidad } from "./detalle-incapacidad"
import { fecha, fechaHora, pesos } from "./formato"
import { useIncapacidades } from "./incapacidades-context"
import { AreaTexto, Aviso, Campo, Cargando, Entrada, Etiqueta, Indicador, Panel, Selector, Tabla, celda, celdaNum } from "./ui"

// ─── PQRD ─────────────────────────────────────────────────────────────────────

export function PqrdTab() {
  const { datos, items } = useIncapacidades()
  const [entidad, setEntidad] = useState("")
  const [vista, setVista] = useState<"abiertas" | "vencidas" | "todas">("abiertas")
  const [abierta, setAbierta] = useState<string | null>(null)
  const incPorId = useMemo(() => new Map(items.map((x) => [x.inc.id!, x])), [items])
  if (!datos) return null

  const vencida = (p: (typeof datos.pqrd)[number]) => p.estado === "Abierta" && datos.corte > p.fechaLimite
  const lista = datos.pqrd
    .filter((p) => (!entidad || p.entidad === entidad) && (vista === "todas" || (vista === "abiertas" ? p.estado === "Abierta" : vencida(p))))
    .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador etiqueta="PQRD abiertas" valor={datos.pqrd.filter((p) => p.estado === "Abierta").length} />
        <Indicador etiqueta="Vencidas sin respuesta" valor={datos.pqrd.filter(vencida).length} tono={datos.pqrd.some(vencida) ? "peligro" : "neutro"} />
        <Indicador etiqueta="Respondidas a favor" valor={datos.pqrd.filter((p) => p.estado === "Respondida a favor").length} tono="bien" />
      </div>
      <Panel
        titulo="PQRD"
        descripcion="Se montan desde la ficha de la incapacidad (botón «Montar PQRD»)."
        acciones={
          <>
            <Selector className="w-44" opciones={[{ valor: "abiertas", texto: "Abiertas" }, { valor: "vencidas", texto: "Vencidas" }, { valor: "todas", texto: "Todas" }]} value={vista} onChange={(e) => setVista(e.target.value as typeof vista)} />
            <Selector className="w-44" vacio="Todas las entidades" opciones={[...new Set(datos.pqrd.map((p) => p.entidad))].sort()} value={entidad} onChange={(e) => setEntidad(e.target.value)} />
          </>
        }
      >
        <Tabla encabezados={["Radicado", "Colaborador", "Nº incapacidad", "Entidad", "Radicación", "Límite", "Estado", "Saldo"]} vacio="Sin PQRD con estos filtros.">
          {lista.map((p) => {
            const x = incPorId.get(p.incapacidadId)
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setAbierta(p.incapacidadId)}>
                <td className={`${celda} font-mono text-xs`}>{p.radicado}</td>
                <td className={celda}>{x?.inc.nombre ?? "—"}</td>
                <td className={`${celda} font-mono text-xs`}>{x?.inc.nroIncapacidad ?? "—"}</td>
                <td className={celda}>{p.entidad}</td>
                <td className={celda}>{fecha(p.fechaRadicacion)}</td>
                <td className={celda}>{fecha(p.fechaLimite)}{vencida(p) && <span className="ml-2"><Etiqueta tono="peligro">Vencida</Etiqueta></span>}</td>
                <td className={celda}><Etiqueta tono={p.estado === "Respondida a favor" ? "bien" : p.estado === "Abierta" ? "info" : "alerta"}>{p.estado}</Etiqueta></td>
                <td className={celdaNum}>{pesos(x?.cobro.saldo)}</td>
              </tr>
            )
          })}
        </Tabla>
      </Panel>
      <DetalleIncapacidad id={abierta} onCerrar={() => setAbierta(null)} />
    </div>
  )
}

// ─── Alertas (RF-08) ──────────────────────────────────────────────────────────

interface Alerta {
  id: string; tipo: "hito" | "previa" | "pqrd_vencida"; identificacion: string; nombre: string | null; hito: number | null
  dias_acumulados: number | null; fecha_cumplimiento: string | null; incapacidad_id: string | null; eps: string | null
  accion_sugerida: string | null; estado: "Pendiente" | "Atendida"; atendida_por: string | null; atendida_at: string | null
  nota: string | null; created_at: string; incapacidades: { nro_incapacidad: string } | null
}

const NOMBRE_TIPO = { hito: "Hito", previa: "Previa", pqrd_vencida: "PQRD sin respuesta" }

export function AlertasTab() {
  const { puede, recargar } = useIncapacidades()
  const [estado, setEstado] = useState<"Pendiente" | "Atendida" | "">("Pendiente")
  const [tipo, setTipo] = useState("")
  const [alertas, setAlertas] = useState<Alerta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [evaluando, setEvaluando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const q = new URLSearchParams()
    if (estado) q.set("estado", estado)
    if (tipo) q.set("tipo", tipo)
    try {
      setAlertas((await pedir<{ alertas: Alerta[] }>(`/api/incapacidades/alertas?${q}`)).alertas)
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }, [estado, tipo])

  useEffect(() => {
    void (async () => { await cargar() })()
  }, [cargar])

  const evaluar = async () => {
    setEvaluando(true); setMensaje(null)
    try {
      const r = await pedir<{ nuevas: number; corte: string }>("/api/incapacidades/alertas/evaluar", { method: "POST" })
      setMensaje(r.nuevas ? `Se generaron ${r.nuevas} alerta(s) nueva(s) con corte ${fecha(r.corte)}.` : `Sin alertas nuevas (corte ${fecha(r.corte)}).`)
      await cargar()
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setEvaluando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Aviso>
        Hitos de 90, 120, 150 y 180 días acumulados (y aviso previo), y PQRD sin respuesta. Se evalúan después de cada carga o edición
        y una vez al día. Por ahora solo se muestran aquí: el envío por correo queda pendiente.
      </Aviso>
      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Panel
        titulo="Alertas"
        acciones={
          <>
            <Selector className="w-40" vacio="Todas" opciones={["Pendiente", "Atendida"]} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} />
            <Selector className="w-48" vacio="Todos los tipos" opciones={Object.entries(NOMBRE_TIPO).map(([valor, texto]) => ({ valor, texto }))} value={tipo} onChange={(e) => setTipo(e.target.value)} />
            {puede("atender_alerta") && <Button size="sm" variant="outline" disabled={evaluando} onClick={evaluar}><RefreshCw className={evaluando ? "animate-spin" : ""} /> Evaluar ahora</Button>}
          </>
        }
      >
        {!alertas ? <Cargando /> : (
          <div className="space-y-2">
            {alertas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin alertas con estos filtros.</p>}
            {alertas.map((a) => (
              <TarjetaAlerta key={a.id} alerta={a} onAbrir={setAbierta} onListo={async () => { await cargar(); await recargar() }} />
            ))}
          </div>
        )}
      </Panel>
      <DetalleIncapacidad id={abierta} onCerrar={() => setAbierta(null)} />
    </div>
  )
}

function TarjetaAlerta({ alerta: a, onAbrir, onListo }: { alerta: Alerta; onAbrir: (id: string) => void; onListo: () => Promise<void> }) {
  const { puede } = useIncapacidades()
  const [atendiendo, setAtendiendo] = useState(false)
  const [nota, setNota] = useState("")
  const [error, setError] = useState<string | null>(null)
  const titulo = a.tipo === "pqrd_vencida" ? "PQRD sin respuesta" : `${a.tipo === "previa" ? "Se acerca al día" : "Día"} ${a.hito}`
  const tono = a.tipo === "pqrd_vencida" ? "peligro" : a.hito && a.hito >= 180 ? "peligro" : a.tipo === "previa" ? "info" : "alerta"

  return (
    <div className={`rounded-lg border p-3 text-sm ${a.estado === "Atendida" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tono={tono}>{titulo}</Etiqueta>
          <button type="button" className="font-medium hover:underline" disabled={!a.incapacidad_id} onClick={() => a.incapacidad_id && onAbrir(a.incapacidad_id)}>
            {a.nombre ?? a.identificacion}
          </button>
          <span className="font-mono text-xs text-muted-foreground">{a.identificacion}</span>
        </div>
        <Etiqueta tono={a.estado === "Atendida" ? "bien" : "neutro"}>{a.estado}</Etiqueta>
      </div>
      <p className="mt-1 text-muted-foreground">
        {a.eps && <>{a.eps} · </>}
        {a.dias_acumulados !== null && <>{a.dias_acumulados} días acumulados · </>}
        {a.fecha_cumplimiento && <>{a.tipo === "previa" ? "llegaría el" : a.tipo === "pqrd_vencida" ? "venció el" : "cumplió el"} {fecha(a.fecha_cumplimiento)} · </>}
        {a.incapacidades?.nro_incapacidad && <>Nº {a.incapacidades.nro_incapacidad}</>}
      </p>
      {a.accion_sugerida && <p className="mt-1">{a.accion_sugerida}</p>}
      {a.estado === "Atendida" && <p className="mt-1 text-xs text-muted-foreground">Atendida por {a.atendida_por} el {fechaHora(a.atendida_at)}: {a.nota}</p>}
      {a.estado === "Pendiente" && puede("atender_alerta") && (
        atendiendo ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Entrada className="max-w-md" placeholder="Nota corta (obligatoria)" value={nota} onChange={(e) => setNota(e.target.value)} />
            <Button size="sm" disabled={!nota.trim()} onClick={async () => {
              try {
                await pedir(`/api/incapacidades/alertas/${a.id}`, { method: "PATCH", body: { nota } })
                await onListo()
              } catch (e) { setError(mensajeDe(e)) }
            }}>Marcar atendida</Button>
            <Button size="sm" variant="ghost" onClick={() => setAtendiendo(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button className="mt-2" size="sm" variant="outline" onClick={() => setAtendiendo(true)}>Atender</Button>
        )
      )}
      {error && <p className="mt-1 text-destructive">{error}</p>}
    </div>
  )
}

// ─── Parámetros (RF-10, solo administrador) ───────────────────────────────────

const NUMEROS: { clave: keyof ParametrosIncapacidades; etiqueta: string; ayuda?: string }[] = [
  { clave: "diasMora", etiqueta: "Días para considerar en mora", ayuda: "Desde la radicación EPS (o nómina)" },
  { clave: "toleranciaRedondeo", etiqueta: "Tolerancia por redondeo ($)" },
  { clave: "mesesPrescripcion", etiqueta: "Meses de prescripción", ayuda: "Por validar con jurídica" },
  { clave: "mesesAnticipacionPrescripcion", etiqueta: "Meses de anticipación (prescripción)" },
  { clave: "diasHabilesPqrd", etiqueta: "Días hábiles para responder PQRD" },
  { clave: "diasAlertaPrevia", etiqueta: "Días de aviso previo a cada hito" },
  { clave: "diasMinimosSugerenciaTransito", etiqueta: "Días mínimos para sugerir tránsito" },
]
const LISTAS: { clave: keyof ParametrosIncapacidades; etiqueta: string }[] = [
  { clave: "listaEps", etiqueta: "EPS / ARL" },
  { clave: "listaFondos", etiqueta: "Fondos de pensiones" },
  { clave: "listaEstados", etiqueta: "Estados" },
  { clave: "listaCausales", etiqueta: "Causales de no pago" },
  { clave: "listaTipos", etiqueta: "Tipos de incapacidad" },
  { clave: "correosAlertas", etiqueta: "Correos de alertas" },
]

export function ParametrosTab() {
  const { datos, recargar } = useIncapacidades()
  const [v, setV] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)
  if (!datos) return null
  const p = datos.params

  const valor = (clave: keyof ParametrosIncapacidades): string => {
    if (clave in v) return v[clave]
    const actual = p[clave]
    if (Array.isArray(actual)) return clave === "hitosDias" ? actual.join(", ") : actual.join("\n")
    return actual === null ? "" : String(actual)
  }
  const set = (clave: string, x: string) => setV({ ...v, [clave]: x })

  const guardar = async () => {
    const cambios: Record<string, unknown> = {}
    for (const [clave, x] of Object.entries(v)) {
      if (clave === "fechaCorte") cambios.fechaCorte = x || null
      else if (clave === "hitosDias") cambios.hitosDias = x.split(/[,\s]+/).filter(Boolean).map(Number)
      else if (LISTAS.some((l) => l.clave === clave)) cambios[clave] = x.split("\n").map((s) => s.trim()).filter(Boolean)
      else cambios[clave] = Number(x)
    }
    setGuardando(true); setMensaje(null)
    try {
      const r = await pedir<{ alertasNuevas: number }>("/api/incapacidades/parametros", { method: "PUT", body: cambios })
      setV({})
      await recargar()
      setMensaje({ tipo: "ok", texto: `Parámetros guardados.${r.alertasNuevas ? ` Se generaron ${r.alertasNuevas} alerta(s) nueva(s).` : ""}` })
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDe(e) })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      <Panel titulo="Parámetros" descripcion="Cada cambio queda en la auditoría." acciones={
        <Button size="sm" onClick={guardar} disabled={guardando || Object.keys(v).length === 0}><Save /> {guardando ? "Guardando…" : "Guardar cambios"}</Button>
      }>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Fecha de corte" ayuda="Vacía = hoy (hora de Colombia). Úsela para un corte mensual fijo.">
            <Entrada type="date" value={valor("fechaCorte")} onChange={(e) => set("fechaCorte", e.target.value)} />
          </Campo>
          <Campo etiqueta="Hitos de días acumulados" ayuda="Separados por coma">
            <Entrada value={valor("hitosDias")} onChange={(e) => set("hitosDias", e.target.value)} />
          </Campo>
          {NUMEROS.map((n) => (
            <Campo key={n.clave} etiqueta={n.etiqueta} ayuda={n.ayuda}>
              <Entrada type="number" min={0} value={valor(n.clave)} onChange={(e) => set(n.clave, e.target.value)} />
            </Campo>
          ))}
        </div>
      </Panel>
      <Panel titulo="Listas" descripcion="Un valor por línea. Los estados y tipos que la app usa en sus reglas no se pueden quitar.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LISTAS.map((l) => (
            <Campo key={l.clave} etiqueta={l.etiqueta}>
              <AreaTexto rows={8} value={valor(l.clave)} onChange={(e) => set(l.clave, e.target.value)} />
            </Campo>
          ))}
        </div>
      </Panel>
    </div>
  )
}
