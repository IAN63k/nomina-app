"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Ban, FileUp, HandCoins, MessageSquarePlus, Pencil, Phone, Scale, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { hoyBogota } from "@/src/services/incapacidadesEngine"
import type { CobroCalculado, Incapacidad } from "@/src/types/incapacidad"
import { mensajeDe, pedir } from "./api"
import { fecha, fechaHora, pesos } from "./formato"
import { useIncapacidades, type PqrdVista } from "./incapacidades-context"
import { AreaTexto, Aviso, Campo, Cargando, Entrada, Etiqueta, EtiquetaAlerta, Selector, Tabla, celda, celdaNum } from "./ui"

interface PagoFicha {
  id: string; tramo: "eps" | "fondo"; fechaPago: string; valor: number; observacion: string | null
  anulado: boolean; motivoAnulacion: string | null; anuladoPor: string | null; creadoPor: string | null
}
interface Ficha {
  incapacidad: Incapacidad
  cobro: CobroCalculado
  corte: string
  pagos: PagoFicha[]
  gestiones: { id: string; fecha: string; tipo: string; accion: string; responsable: string | null; creadoPor: string }[]
  pqrd: PqrdVista[]
  auditoria: { accion: string; campo: string | null; valor_anterior: unknown; valor_nuevo: unknown; usuario: string; created_at: string }[]
}
type Accion = null | "editar" | "rechazar" | "sin_subsidio" | "pago" | "gestion" | "pqrd"

export function DetalleIncapacidad({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const { recargar, puede, datos } = useIncapacidades()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accion, setAccion] = useState<Accion>(null)
  const [aviso, setAviso] = useState<ReactNode>(null)

  const cargar = useCallback(async (incId: string) => {
    try {
      setFicha(await pedir<Ficha>(`/api/incapacidades/${incId}`))
      setError(null)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }, [])

  useEffect(() => {
    let vigente = true
    ;(async () => {
      if (!id) return
      if (vigente) { setFicha(null); setAccion(null); setAviso(null) }
      await cargar(id)
    })()
    return () => { vigente = false }
  }, [id, cargar])

  /** Después de cualquier cambio: refrescar la ficha y la tabla. */
  const hecho = async (mensaje?: ReactNode) => {
    setAccion(null)
    setAviso(mensaje ?? null)
    if (id) await cargar(id)
    await recargar()
  }

  const inc = ficha?.incapacidad
  const fondoTramo = ficha?.cobro.tramos.find((t) => t.tramo === "fondo")
  const fondoActual = inc && datos ? datos.fondos[inc.identificacion] ?? null : null

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{inc ? inc.nombre : "Incapacidad"}</SheetTitle>
          <SheetDescription>
            {inc ? <>CC {inc.identificacion} · Nº {inc.nroIncapacidad} · {inc.tipo}</> : "Cargando la ficha…"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {error && <Aviso tipo="error">{error}</Aviso>}
          {!ficha && !error && <Cargando />}
          {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

          {ficha && inc && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Etiqueta>{inc.estado}</Etiqueta>
                <EtiquetaAlerta alerta={ficha.cobro.alerta} />
                {inc.causalNoPago && <Etiqueta tono="alerta">{inc.causalNoPago}</Etiqueta>}
                {inc.sugeridoTransito && inc.tipo !== "Accidente de tránsito" && <Etiqueta tono="info">Posible accidente de tránsito</Etiqueta>}
              </div>

              {[...inc.paraRevisar, ...ficha.cobro.avisos].length > 0 && (
                <Aviso tipo="alerta">
                  <ul className="list-disc pl-4">{[...new Set([...inc.paraRevisar, ...ficha.cobro.avisos])].map((m) => <li key={m}>{m}</li>)}</ul>
                </Aviso>
              )}

              <Seccion titulo="Cobro">
                <Tabla encabezados={["Entidad", "Días", "Valor", "Pagado", "Saldo"]}>
                  {ficha.cobro.tramos.map((t) => (
                    <tr key={t.tramo}>
                      <td className={celda}>{t.entidad}<span className="ml-1 text-xs text-muted-foreground">({t.tramo === "eps" ? "EPS/ARL" : "fondo"})</span></td>
                      <td className={celdaNum}>{t.dias}</td>
                      <td className={celdaNum}>{pesos(t.valor)}</td>
                      <td className={celdaNum}>{pesos(t.pagado)}</td>
                      <td className={`${celdaNum} font-medium`}>{pesos(t.saldo)}</td>
                    </tr>
                  ))}
                </Tabla>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Dato etiqueta="Días desde radicación" valor={ficha.cobro.diasDesdeRadicacion ?? "—"} />
                  <Dato etiqueta="Último pago" valor={fecha(ficha.cobro.fechaUltimoPago)} />
                  <Dato etiqueta="Prescripción estimada" valor={fecha(ficha.cobro.fechaPrescripcion)} />
                </dl>
                {fondoTramo && puede("editar_seguimiento") && (
                  <FondoColaborador identificacion={inc.identificacion} actual={fondoActual} onListo={(f) => hecho(`Fondo de pensiones registrado: ${f}`)} />
                )}
              </Seccion>

              <Seccion titulo="Datos">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Dato etiqueta="Desde" valor={fecha(inc.fechaDesde)} />
                  <Dato etiqueta="Hasta" valor={fecha(inc.fechaHasta)} />
                  <Dato etiqueta="Días / acumulados" valor={`${inc.dias} / ${inc.diasAcumulados}${inc.esProrroga ? " (prórroga)" : ""}`} />
                  <Dato etiqueta="EPS / ARL" valor={inc.eps ?? "—"} />
                  <Dato etiqueta="Radicación nómina" valor={fecha(inc.fechaRadicacionNomina)} />
                  <Dato etiqueta="Radicación EPS" valor={fecha(inc.fechaRadicacionEps)} />
                  <Dato etiqueta="Responsable" valor={inc.responsable ?? "—"} />
                  {inc.finLactancia && <Dato etiqueta="Fin lactancia" valor={fecha(inc.finLactancia)} />}
                  <Dato etiqueta="Origen" valor={inc.origen ?? "—"} />
                </dl>
                {inc.observacion && <p className="mt-2 text-sm text-muted-foreground">{inc.observacion}</p>}
              </Seccion>

              {/* Acciones */}
              <div className="flex flex-wrap gap-2">
                {puede("editar_seguimiento") && <Button size="sm" variant="outline" onClick={() => setAccion("editar")}><Pencil /> Editar seguimiento</Button>}
                {puede("registrar_pago") && <Button size="sm" variant="outline" onClick={() => setAccion("pago")}><HandCoins /> Registrar pago</Button>}
                {puede("editar_seguimiento") && inc.estado !== "Rechazada" && <Button size="sm" variant="outline" onClick={() => setAccion("rechazar")}><ShieldX /> Marcar rechazada</Button>}
                {puede("editar_seguimiento") && inc.estado !== "Sin subsidio" && <Button size="sm" variant="outline" onClick={() => setAccion("sin_subsidio")}><Ban /> Marcar sin subsidio</Button>}
                {puede("registrar_gestion") && <Button size="sm" variant="outline" onClick={() => setAccion("pqrd")}><Scale /> Montar PQRD</Button>}
                {puede("registrar_gestion") && <Button size="sm" variant="outline" onClick={() => setAccion("gestion")}><Phone /> Registrar gestión</Button>}
              </div>

              {datos && accion === "editar" && <FormEditar inc={inc} params={datos.params} onCancelar={() => setAccion(null)} onListo={hecho} />}
              {datos && (accion === "rechazar" || accion === "sin_subsidio") && (
                <FormMarcar inc={inc} params={datos.params} estado={accion === "rechazar" ? "Rechazada" : "Sin subsidio"} onCancelar={() => setAccion(null)} onListo={hecho} />
              )}
              {accion === "pago" && <FormPago inc={inc} tramos={ficha.cobro.tramos.map((t) => t.tramo)} onCancelar={() => setAccion(null)} onListo={hecho} />}
              {accion === "gestion" && <FormGestion incId={inc.id!} onCancelar={() => setAccion(null)} onListo={hecho} />}
              {datos && accion === "pqrd" && <FormPqrd inc={inc} entidades={[...datos.params.listaEps, ...datos.params.listaFondos]} onCancelar={() => setAccion(null)} onListo={hecho} />}

              <Seccion titulo={`PQRD (${ficha.pqrd.length})`}>
                {ficha.pqrd.length === 0 ? <p className="text-sm text-muted-foreground">Sin PQRD.</p> : (
                  <div className="space-y-3">
                    {ficha.pqrd.map((p) => <TarjetaPqrd key={p.id} pqrd={p} corte={ficha.corte} onListo={hecho} />)}
                  </div>
                )}
              </Seccion>

              <Seccion titulo={`Pagos (${ficha.pagos.length})`}>
                <Tabla encabezados={["Fecha", "Tramo", "Valor", "Observación", ""]} vacio="Sin pagos registrados.">
                  {ficha.pagos.map((p) => <FilaPago key={p.id} pago={p} onListo={hecho} />)}
                </Tabla>
              </Seccion>

              <Seccion titulo={`Gestiones (${ficha.gestiones.length})`}>
                <Tabla encabezados={["Fecha", "Tipo", "Acción", "Por"]} vacio="Sin gestiones.">
                  {[...ficha.gestiones].reverse().map((g) => (
                    <tr key={g.id}>
                      <td className={celda}>{fecha(g.fecha)}</td>
                      <td className={celda}>{g.tipo}</td>
                      <td className="px-3 py-2">{g.accion}</td>
                      <td className={celda}>{g.responsable ?? g.creadoPor}</td>
                    </tr>
                  ))}
                </Tabla>
              </Seccion>

              <Seccion titulo="Historial de cambios">
                <Tabla encabezados={["Cuándo", "Quién", "Cambio"]} vacio="Sin cambios desde la carga.">
                  {ficha.auditoria.map((a, i) => (
                    <tr key={i}>
                      <td className={celda}>{fechaHora(a.created_at)}</td>
                      <td className={celda}>{a.usuario}</td>
                      <td className="px-3 py-2">{a.campo ?? a.accion}: {texto(a.valor_anterior)} → {texto(a.valor_nuevo)}</td>
                    </tr>
                  ))}
                </Tabla>
              </Seccion>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const texto = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v))

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  )
}

/** Envoltura de formulario con manejo de envío y error. */
function Formulario({ titulo, onCancelar, onEnviar, children, listo = true, textoBoton = "Guardar" }: {
  titulo: string; onCancelar: () => void; onEnviar: () => Promise<void>; children: ReactNode; listo?: boolean; textoBoton?: string
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/20 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true); setError(null)
        try { await onEnviar() } catch (err) { setError(mensajeDe(err)) } finally { setEnviando(false) }
      }}
    >
      <h4 className="text-sm font-semibold">{titulo}</h4>
      {children}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!listo || enviando}>{enviando ? "Guardando…" : textoBoton}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}

type Params = NonNullable<ReturnType<typeof useIncapacidades>["datos"]>["params"]

function FormEditar({ inc, params, onCancelar, onListo }: { inc: Incapacidad; params: Params; onCancelar: () => void; onListo: (m?: ReactNode) => Promise<void> }) {
  const [v, setV] = useState({
    estado: inc.estado, causalNoPago: inc.causalNoPago ?? "", fechaRadicacionEps: inc.fechaRadicacionEps ?? "",
    tipo: inc.tipo, responsable: inc.responsable ?? "", esProrroga: inc.esProrroga, diasAcumulados: String(inc.diasAcumulados),
    valorFondoManual: inc.valorFondoManual === null ? "" : String(inc.valorFondoManual), observacion: inc.observacion ?? "", motivo: "",
  })
  const set = (c: Partial<typeof v>) => setV({ ...v, ...c })
  const enviar = async () => {
    const cambios: Record<string, unknown> = {}
    if (v.estado !== inc.estado) cambios.estado = v.estado
    if ((v.causalNoPago || null) !== inc.causalNoPago) cambios.causalNoPago = v.causalNoPago || null
    if ((v.fechaRadicacionEps || null) !== inc.fechaRadicacionEps) cambios.fechaRadicacionEps = v.fechaRadicacionEps || null
    if (v.tipo !== inc.tipo) cambios.tipo = v.tipo
    if ((v.responsable || null) !== inc.responsable) cambios.responsable = v.responsable || null
    if (v.esProrroga !== inc.esProrroga) cambios.esProrroga = v.esProrroga
    if (Number(v.diasAcumulados) !== inc.diasAcumulados) cambios.diasAcumulados = Number(v.diasAcumulados)
    const fondoManual = v.valorFondoManual === "" ? null : Number(v.valorFondoManual)
    if (fondoManual !== inc.valorFondoManual) cambios.valorFondoManual = fondoManual
    if ((v.observacion || null) !== inc.observacion) cambios.observacion = v.observacion || null
    if (v.motivo) cambios.motivo = v.motivo
    const r = await pedir<{ alertasNuevas: number }>(`/api/incapacidades/${inc.id}`, { method: "PATCH", body: cambios })
    await onListo(r.alertasNuevas ? `Cambios guardados. Se generaron ${r.alertasNuevas} alerta(s) nueva(s).` : "Cambios guardados.")
  }
  return (
    <Formulario titulo="Editar seguimiento" onCancelar={onCancelar} onEnviar={enviar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Estado"><Selector opciones={params.listaEstados} value={v.estado} onChange={(e) => set({ estado: e.target.value })} /></Campo>
        <Campo etiqueta="Causal de no pago" ayuda="Obligatoria en Rechazada y Sin subsidio">
          <Selector vacio="—" opciones={params.listaCausales} value={v.causalNoPago} onChange={(e) => set({ causalNoPago: e.target.value })} />
        </Campo>
        <Campo etiqueta="Fecha radicación EPS"><Entrada type="date" max={hoyBogota()} value={v.fechaRadicacionEps} onChange={(e) => set({ fechaRadicacionEps: e.target.value })} /></Campo>
        <Campo etiqueta="Tipo de incapacidad"><Selector opciones={params.listaTipos} value={v.tipo} onChange={(e) => set({ tipo: e.target.value })} /></Campo>
        <Campo etiqueta="Responsable"><Entrada value={v.responsable} onChange={(e) => set({ responsable: e.target.value })} /></Campo>
        <Campo etiqueta="Días acumulados" ayuda="Solo para corregir lo que vino de KactuS">
          <Entrada type="number" min={inc.dias} value={v.diasAcumulados} onChange={(e) => set({ diasAcumulados: e.target.value })} />
        </Campo>
        <Campo etiqueta="Valor a cobrar al fondo" ayuda="Vacío = proporcional a los días después del 180">
          <Entrada type="number" min={0} value={v.valorFondoManual} onChange={(e) => set({ valorFondoManual: e.target.value })} />
        </Campo>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" checked={v.esProrroga} onChange={(e) => set({ esProrroga: e.target.checked })} /> ¿Es prórroga?
        </label>
        <Campo etiqueta="Observación" className="sm:col-span-2"><AreaTexto value={v.observacion} onChange={(e) => set({ observacion: e.target.value })} /></Campo>
        <Campo etiqueta="Motivo del cambio" ayuda="Obligatorio para Castigada, Prescrita o reabrir una Sin subsidio" className="sm:col-span-2">
          <Entrada value={v.motivo} onChange={(e) => set({ motivo: e.target.value })} />
        </Campo>
      </div>
    </Formulario>
  )
}

function FormMarcar({ inc, params, estado, onCancelar, onListo }: {
  inc: Incapacidad; params: Params; estado: "Rechazada" | "Sin subsidio"; onCancelar: () => void; onListo: (m?: ReactNode) => Promise<void>
}) {
  const [causal, setCausal] = useState("")
  const [fechaRespuesta, setFechaRespuesta] = useState("")
  const [nota, setNota] = useState("")
  const enviar = async () => {
    const detalle = estado === "Rechazada" && fechaRespuesta ? `Respuesta EPS del ${fecha(fechaRespuesta)}. ${nota}` : nota
    await pedir(`/api/incapacidades/${inc.id}`, { method: "PATCH", body: { estado, causalNoPago: causal, motivo: detalle.trim() } })
    await onListo(estado === "Rechazada" ? "Marcada como rechazada. Puede montar una PQRD." : "Marcada sin subsidio: el valor a cobrar queda en $0.")
  }
  return (
    <Formulario titulo={`Marcar ${estado.toLowerCase()}`} onCancelar={onCancelar} onEnviar={enviar} listo={Boolean(causal && nota.trim())}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Causal de no pago"><Selector vacio="Elegir…" opciones={params.listaCausales} value={causal} onChange={(e) => setCausal(e.target.value)} /></Campo>
        {estado === "Rechazada" && (
          <Campo etiqueta="Fecha de la respuesta de la EPS"><Entrada type="date" max={hoyBogota()} value={fechaRespuesta} onChange={(e) => setFechaRespuesta(e.target.value)} /></Campo>
        )}
        <Campo etiqueta="Nota" className="sm:col-span-2"><Entrada value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
      </div>
    </Formulario>
  )
}

function FormPago({ inc, tramos, onCancelar, onListo }: { inc: Incapacidad; tramos: ("eps" | "fondo")[]; onCancelar: () => void; onListo: (m?: ReactNode) => Promise<void> }) {
  const [v, setV] = useState({ fechaPago: hoyBogota(), valor: "", tramo: tramos.includes("eps") ? "eps" : "fondo", observacion: "" })
  const [propuesta, setPropuesta] = useState<{ estado: string; aviso: string | null; saldo: number } | null>(null)

  if (propuesta) {
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <Aviso tipo={propuesta.aviso ? "alerta" : "ok"}>
          Pago registrado. Saldo: <strong>{pesos(propuesta.saldo)}</strong>. La app propone el estado <strong>{propuesta.estado}</strong>.
          {propuesta.aviso && <div className="mt-1">{propuesta.aviso}</div>}
        </Aviso>
        <div className="flex flex-wrap gap-2">
          {propuesta.estado !== inc.estado && (
            <Button size="sm" onClick={async () => {
              await pedir(`/api/incapacidades/${inc.id}`, { method: "PATCH", body: { estado: propuesta.estado } })
              await onListo(`Pago registrado y estado actualizado a ${propuesta.estado}.`)
            }}>Confirmar &quot;{propuesta.estado}&quot;</Button>
          )}
          {propuesta.estado !== "Pagada parcial" && inc.estado !== "Pagada parcial" && (
            <Button size="sm" variant="outline" onClick={async () => {
              await pedir(`/api/incapacidades/${inc.id}`, { method: "PATCH", body: { estado: "Pagada parcial" } })
              await onListo("Pago registrado; estado Pagada parcial.")
            }}>Marcar Pagada parcial</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onListo(`Pago registrado; el estado sigue en ${inc.estado}.`)}>Mantener &quot;{inc.estado}&quot;</Button>
        </div>
      </div>
    )
  }

  const enviar = async () => {
    const r = await pedir<{ propuesta: { estado: string; aviso: string | null }; cobro: CobroCalculado }>(
      `/api/incapacidades/${inc.id}/pagos`,
      { method: "POST", body: { fechaPago: v.fechaPago, valor: Number(v.valor), tramo: v.tramo, observacion: v.observacion || null } },
    )
    setPropuesta({ ...r.propuesta, saldo: r.cobro.saldo })
  }
  return (
    <Formulario titulo="Registrar pago" onCancelar={onCancelar} onEnviar={enviar} listo={Number(v.valor) > 0 && Boolean(v.fechaPago)} textoBoton="Registrar pago">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha de pago"><Entrada type="date" max={hoyBogota()} value={v.fechaPago} onChange={(e) => setV({ ...v, fechaPago: e.target.value })} /></Campo>
        <Campo etiqueta="Valor pagado"><Entrada type="number" min={1} value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} /></Campo>
        {tramos.length > 1 && (
          <Campo etiqueta="Pagó"><Selector opciones={[{ valor: "eps", texto: "EPS / ARL" }, { valor: "fondo", texto: "Fondo de pensiones" }]} value={v.tramo} onChange={(e) => setV({ ...v, tramo: e.target.value })} /></Campo>
        )}
        <Campo etiqueta="Observación" ayuda="Ej. número del soporte de pago" className={tramos.length > 1 ? "" : "sm:col-span-2"}>
          <Entrada value={v.observacion} onChange={(e) => setV({ ...v, observacion: e.target.value })} />
        </Campo>
      </div>
    </Formulario>
  )
}

function FilaPago({ pago, onListo }: { pago: PagoFicha; onListo: (m?: ReactNode) => Promise<void> }) {
  const { puede } = useIncapacidades()
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <tr className={pago.anulado ? "text-muted-foreground line-through" : ""}>
        <td className={celda}>{fecha(pago.fechaPago)}</td>
        <td className={celda}>{pago.tramo === "eps" ? "EPS/ARL" : "Fondo"}</td>
        <td className={celdaNum}>{pesos(pago.valor)}</td>
        <td className="px-3 py-2">{pago.anulado ? `Anulado por ${pago.anuladoPor}: ${pago.motivoAnulacion}` : pago.observacion ?? "—"}</td>
        <td className={celda}>
          {!pago.anulado && puede("anular_pago") && !anulando && <Button size="sm" variant="ghost" onClick={() => setAnulando(true)}>Anular</Button>}
        </td>
      </tr>
      {anulando && (
        <tr>
          <td colSpan={5} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Entrada className="max-w-sm" placeholder="Motivo de la anulación (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <Button size="sm" variant="destructive" disabled={!motivo.trim()} onClick={async () => {
                try {
                  await pedir(`/api/incapacidades/pagos/${pago.id}/anular`, { method: "POST", body: { motivo } })
                  await onListo("Pago anulado. Revise si el estado de la incapacidad debe cambiar.")
                } catch (e) { setError(mensajeDe(e)) }
              }}>Confirmar anulación</Button>
              <Button size="sm" variant="ghost" onClick={() => setAnulando(false)}>Cancelar</Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FormGestion({ incId, onCancelar, onListo }: { incId: string; onCancelar: () => void; onListo: (m?: ReactNode) => Promise<void> }) {
  const [v, setV] = useState({ fecha: hoyBogota(), tipo: "Llamada", accion: "", responsable: "" })
  return (
    <Formulario titulo="Registrar gestión" onCancelar={onCancelar} listo={Boolean(v.accion.trim())} onEnviar={async () => {
      await pedir(`/api/incapacidades/${incId}/gestiones`, { method: "POST", body: { ...v, responsable: v.responsable || null } })
      await onListo("Gestión registrada.")
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Fecha"><Entrada type="date" max={hoyBogota()} value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="Tipo"><Selector opciones={["Llamada", "Correo", "Reclamación", "Visita", "Otra"]} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })} /></Campo>
        <Campo etiqueta="Responsable" ayuda="Vacío = usted"><Entrada value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} /></Campo>
        <Campo etiqueta="Acción" className="sm:col-span-3"><AreaTexto value={v.accion} onChange={(e) => setV({ ...v, accion: e.target.value })} /></Campo>
      </div>
    </Formulario>
  )
}

function FormPqrd({ inc, entidades, onCancelar, onListo }: { inc: Incapacidad; entidades: string[]; onCancelar: () => void; onListo: (m?: ReactNode) => Promise<void> }) {
  const [v, setV] = useState({
    radicado: "", entidad: inc.eps ?? "", fechaRadicacion: hoyBogota(),
    motivo: inc.estado === "Rechazada" ? `Rechazo de la incapacidad ${inc.nroIncapacidad} (${pesos(inc.valorIncapacidad)})${inc.causalNoPago ? ` por: ${inc.causalNoPago}` : ""}` : "",
  })
  return (
    <Formulario titulo={`Montar PQRD · ${inc.nombre} · Nº ${inc.nroIncapacidad} · ${pesos(inc.valorIncapacidad)}`} onCancelar={onCancelar}
      listo={Boolean(v.radicado.trim() && v.entidad && v.motivo.trim())}
      onEnviar={async () => {
        const p = await pedir<PqrdVista>(`/api/incapacidades/${inc.id}/pqrd`, { method: "POST", body: v })
        await onListo(<>PQRD {p.radicado} registrada. Fecha límite de respuesta: <strong>{fecha(p.fechaLimite)}</strong>.</>)
      }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nº de radicado"><Entrada value={v.radicado} onChange={(e) => setV({ ...v, radicado: e.target.value })} /></Campo>
        <Campo etiqueta="Entidad"><Selector vacio="Elegir…" opciones={entidades} value={v.entidad} onChange={(e) => setV({ ...v, entidad: e.target.value })} /></Campo>
        <Campo etiqueta="Fecha de radicación"><Entrada type="date" max={hoyBogota()} value={v.fechaRadicacion} onChange={(e) => setV({ ...v, fechaRadicacion: e.target.value })} /></Campo>
        <Campo etiqueta="Motivo" className="sm:col-span-3"><AreaTexto value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} /></Campo>
      </div>
    </Formulario>
  )
}

function TarjetaPqrd({ pqrd, corte, onListo }: { pqrd: PqrdVista; corte: string; onListo: (m?: ReactNode) => Promise<void> }) {
  const { puede } = useIncapacidades()
  const [respondiendo, setRespondiendo] = useState(false)
  const [v, setV] = useState({ estado: "Respondida a favor", fechaRespuesta: hoyBogota(), resumenRespuesta: "" })
  const [error, setError] = useState<string | null>(null)
  const vencida = pqrd.estado === "Abierta" && corte > pqrd.fechaLimite

  const subir = async (archivo: File) => {
    setError(null)
    const form = new FormData()
    form.append("archivo", archivo)
    try {
      await pedir(`/api/incapacidades/pqrd/${pqrd.id}/soporte`, { method: "POST", form })
      await onListo("Soporte cargado.")
    } catch (e) { setError(mensajeDe(e)) }
  }
  const ver = async () => {
    try {
      const { url } = await pedir<{ url: string }>(`/api/incapacidades/pqrd/${pqrd.id}/soporte`)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) { setError(mensajeDe(e)) }
  }

  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">PQRD {pqrd.radicado} · {pqrd.entidad}</div>
        <div className="flex items-center gap-2">
          {vencida && <Etiqueta tono="peligro">Sin respuesta (vencida)</Etiqueta>}
          <Etiqueta tono={pqrd.estado === "Respondida a favor" ? "bien" : pqrd.estado === "Abierta" ? "info" : "alerta"}>{pqrd.estado}</Etiqueta>
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">Radicada {fecha(pqrd.fechaRadicacion)} · límite {fecha(pqrd.fechaLimite)} · {pqrd.motivo}</p>
      {pqrd.resumenRespuesta && <p className="mt-1">Respuesta {fecha(pqrd.fechaRespuesta)}: {pqrd.resumenRespuesta}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pqrd.tieneSoporte && <Button size="sm" variant="outline" onClick={ver}>Ver soporte</Button>}
        {puede("registrar_gestion") && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <FileUp className="h-3.5 w-3.5" /> {pqrd.tieneSoporte ? "Reemplazar soporte" : "Adjuntar soporte"}
            <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }} />
          </label>
        )}
        {pqrd.estado === "Abierta" && puede("registrar_gestion") && !respondiendo && (
          <Button size="sm" variant="outline" onClick={() => setRespondiendo(true)}><MessageSquarePlus /> Registrar respuesta</Button>
        )}
      </div>
      {respondiendo && (
        <div className="mt-3">
          <Formulario titulo="Respuesta de la PQRD" onCancelar={() => setRespondiendo(false)} listo={Boolean(v.resumenRespuesta.trim())} onEnviar={async () => {
            await pedir(`/api/incapacidades/pqrd/${pqrd.id}`, { method: "PATCH", body: v })
            await onListo(v.estado === "Respondida a favor"
              ? "Respuesta registrada: la incapacidad vuelve a En trámite."
              : "Respuesta registrada. Si no hay más gestión, puede pasarla a Castigada con motivo.")
          }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Resultado"><Selector opciones={["Respondida a favor", "Respondida en contra"]} value={v.estado} onChange={(e) => setV({ ...v, estado: e.target.value })} /></Campo>
              <Campo etiqueta="Fecha de respuesta"><Entrada type="date" max={hoyBogota()} value={v.fechaRespuesta} onChange={(e) => setV({ ...v, fechaRespuesta: e.target.value })} /></Campo>
              <Campo etiqueta="Resumen" className="sm:col-span-2"><AreaTexto value={v.resumenRespuesta} onChange={(e) => setV({ ...v, resumenRespuesta: e.target.value })} /></Campo>
            </div>
          </Formulario>
        </div>
      )}
      {error && <div className="mt-2"><Aviso tipo="error">{error}</Aviso></div>}
    </div>
  )
}

function FondoColaborador({ identificacion, actual, onListo }: { identificacion: string; actual: string | null; onListo: (fondo: string) => Promise<void> }) {
  const { datos } = useIncapacidades()
  const [fondo, setFondo] = useState(actual ?? "")
  const [error, setError] = useState<string | null>(null)
  if (!datos) return null
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
      <Campo etiqueta={actual ? "Fondo de pensiones del colaborador" : "Falta el fondo de pensiones: desde el día 181 se cobra al fondo"}>
        <Selector vacio="Elegir…" opciones={datos.params.listaFondos} value={fondo} onChange={(e) => setFondo(e.target.value)} />
      </Campo>
      <Button size="sm" disabled={!fondo || fondo === actual} onClick={async () => {
        try {
          await pedir(`/api/incapacidades/fondos/${encodeURIComponent(identificacion)}`, { method: "PUT", body: { fondo } })
          await onListo(fondo)
        } catch (e) { setError(mensajeDe(e)) }
      }}>Guardar fondo</Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
