"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { resumenCartera, vistaMaternidad, vistaTransito } from "@/src/services/incapacidadesEngine"
import { mensajeDe, pedir } from "./api"
import { fecha, numero, pesos, porcentaje } from "./formato"
import { useIncapacidades } from "./incapacidades-context"
import { Aviso, Etiqueta, EtiquetaAlerta, Indicador, Panel, Tabla, celda, celdaNum } from "./ui"

// ─── Resumen de cartera (RF-05) ───────────────────────────────────────────────

export function ResumenTab() {
  const { items, datos } = useIncapacidades()
  const r = useMemo(() => (datos ? resumenCartera(items, datos.params) : null), [items, datos])
  if (!r || !datos) return null
  const entidades = r.porEntidad.filter((f) => f.incapacidades > 0 || !f.esFondo)

  return (
    <div className="space-y-4">
      {r.inconsistencias.length > 0 && <Aviso tipo="error">{r.inconsistencias.join(". ")}</Aviso>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador etiqueta="Valor radicado" valor={pesos(r.totales.valor)} detalle={`${numero(r.totales.incapacidades)} incapacidades · corte ${fecha(datos.corte)}`} />
        <Indicador etiqueta="Valor pagado" valor={pesos(r.totales.pagado)} tono="bien" />
        <Indicador etiqueta="Saldo pendiente" valor={pesos(r.totales.saldo)} tono="alerta" />
        <Indicador etiqueta="% recuperación" valor={porcentaje(r.totales.recuperacion)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador etiqueta="En mora" valor={r.conteos.enMora} tono={r.conteos.enMora ? "peligro" : "neutro"} />
        <Indicador etiqueta="Riesgo de prescripción" valor={r.conteos.riesgoPrescripcion} tono={r.conteos.riesgoPrescripcion ? "peligro" : "neutro"} />
        <Indicador etiqueta="Rechazadas por gestionar" valor={r.conteos.rechazadasPorGestionar} tono={r.conteos.rechazadasPorGestionar ? "alerta" : "neutro"} />
        <Indicador etiqueta="Pago menor al valor" valor={r.conteos.pagoMenor} detalle={`Dejaron de pagar ${pesos(r.conteos.saldoPagoMenor)}`} tono={r.conteos.pagoMenor ? "alerta" : "neutro"} />
      </div>

      <Panel titulo="Por entidad de cobro" descripcion="EPS/ARL y fondos de pensiones (desde el día 181).">
        <Tabla encabezados={["Entidad", "# incapacidades", "Valor radicado", "Pagado", "Saldo", "% recuperación", "# en mora", "# riesgo prescripción"]}>
          {entidades.map((f) => (
            <tr key={f.entidad} className={f.incapacidades === 0 ? "text-muted-foreground" : ""}>
              <td className={celda}>{f.entidad}{f.esFondo && <span className="ml-1 text-xs text-muted-foreground">(fondo)</span>}</td>
              <td className={celdaNum}>{f.incapacidades}</td>
              <td className={celdaNum}>{pesos(f.valor)}</td>
              <td className={celdaNum}>{pesos(f.pagado)}</td>
              <td className={celdaNum}>{pesos(f.saldo)}</td>
              <td className={celdaNum}>{porcentaje(f.recuperacion)}</td>
              <td className={celdaNum}>{f.enMora}</td>
              <td className={celdaNum}>{f.riesgoPrescripcion}</td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-semibold">
            <td className={celda}>Total</td>
            <td className={celdaNum}></td>
            <td className={celdaNum}>{pesos(r.totales.valor)}</td>
            <td className={celdaNum}>{pesos(r.totales.pagado)}</td>
            <td className={celdaNum}>{pesos(r.totales.saldo)}</td>
            <td className={celdaNum}>{porcentaje(r.totales.recuperacion)}</td>
            <td className={celdaNum}>{r.conteos.enMora}</td>
            <td className={celdaNum}>{r.conteos.riesgoPrescripcion}</td>
          </tr>
        </Tabla>
        <div className="mt-3">
          <Aviso tipo={r.valorFueraDeLista === 0 ? "ok" : "alerta"}>
            Control — valor radicado de entidades fuera de las listas (incluye fondo sin asignar): <strong>{pesos(r.valorFueraDeLista)}</strong>.
            {r.valorFueraDeLista !== 0 && " Debe ser $0: registre el fondo de pensiones o agregue la entidad en Parámetros."}
          </Aviso>
        </div>
      </Panel>

      <Panel titulo="Por estado">
        <Tabla encabezados={["Estado", "# incapacidades", "Valor radicado", "Saldo"]}>
          {r.porEstado.map((f) => (
            <tr key={f.estado} className={f.incapacidades === 0 ? "text-muted-foreground" : ""}>
              <td className={celda}>{f.estado}</td>
              <td className={celdaNum}>{f.incapacidades}</td>
              <td className={celdaNum}>{pesos(f.valor)}</td>
              <td className={celdaNum}>{pesos(f.saldo)}</td>
            </tr>
          ))}
        </Tabla>
      </Panel>
    </div>
  )
}

// ─── Accidentes de tránsito (RF-06) ───────────────────────────────────────────

export function TransitoTab() {
  const { items, datos, recargar, puede } = useIncapacidades()
  const v = useMemo(() => (datos ? vistaTransito(items, datos.corte, datos.params) : null), [items, datos])
  const [marcando, setMarcando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)
  if (!v || !datos) return null

  const idPorNro = new Map(items.map((x) => [`${x.inc.identificacion}|${x.inc.nroIncapacidad}`, x.inc.id!]))
  const marcar = async (identificacion: string, nros: string[]) => {
    setMarcando(identificacion); setMensaje(null)
    try {
      for (const nro of nros) {
        const id = idPorNro.get(`${identificacion}|${nro}`)
        if (id) await pedir(`/api/incapacidades/${id}`, { method: "PATCH", body: { tipo: "Accidente de tránsito" } })
      }
      await recargar()
      setMensaje({ tipo: "ok", texto: `Marcadas ${nros.length} incapacidad(es) como accidente de tránsito.` })
    } catch (e) {
      setMensaje({ tipo: "error", texto: mensajeDe(e) })
    } finally {
      setMarcando(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Indicador etiqueta="Colaboradores" valor={v.indicadores.colaboradores} />
        <Indicador etiqueta="Se acercan al 120" valor={v.indicadores.seAcercanA120} tono={v.indicadores.seAcercanA120 ? "alerta" : "neutro"} />
        <Indicador etiqueta="Día 120+" valor={v.indicadores.dia120} tono={v.indicadores.dia120 ? "alerta" : "neutro"} />
        <Indicador etiqueta="Día 150+" valor={v.indicadores.dia150} tono={v.indicadores.dia150 ? "peligro" : "neutro"} />
        <Indicador etiqueta="Superaron 180" valor={v.indicadores.superaron180} tono={v.indicadores.superaron180 ? "peligro" : "neutro"} />
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <Panel titulo="Incapacidades por accidente de tránsito" descripcion='Marque el tipo "Accidente de tránsito" en la ficha o desde los candidatos.'>
        <Tabla encabezados={["Colaborador", "Nº", "EPS", "Desde", "Hasta", "Días", "Acumulados", "Para 180", "Día 120", "Día 150", "Día 180", "Estado", "Saldo"]} vacio="No hay incapacidades marcadas como tránsito.">
          {v.filas.map((f) => (
            <tr key={f.item.inc.id} className={f.registroMasReciente ? "" : "text-muted-foreground"}>
              <td className={celda}>{f.item.inc.nombre}</td>
              <td className={`${celda} font-mono text-xs`}>{f.item.inc.nroIncapacidad}</td>
              <td className={celda}>{f.item.inc.eps ?? "—"}</td>
              <td className={celda}>{fecha(f.item.inc.fechaDesde)}</td>
              <td className={celda}>{fecha(f.item.inc.fechaHasta)}</td>
              <td className={celdaNum}>{f.item.inc.dias}</td>
              <td className={celdaNum}>{f.diasAcumulados}</td>
              <td className={celdaNum}>{f.diasPara180}</td>
              <td className={celda}>{fecha(f.fechaDia120)}</td>
              <td className={celda}>{fecha(f.fechaDia150)}</td>
              <td className={celda}>{fecha(f.fechaDia180)}</td>
              <td className="px-3 py-2 text-xs">{f.estado}</td>
              <td className={celdaNum}>{pesos(f.item.cobro.saldo)}</td>
            </tr>
          ))}
        </Tabla>
      </Panel>

      <Panel titulo="Candidatos por confirmar" descripcion={`Diagnóstico de lesión (CIE-10 S, T, V–Y) y ${datos.params.diasMinimosSugerenciaTransito} o más días acumulados. KactuS no trae el dato: confírmelo antes de marcar.`}>
        <Tabla encabezados={["Colaborador", "Identificación", "Días acumulados", "Última fecha hasta", "Incapacidades sugeridas", ""]} vacio="Sin candidatos.">
          {v.candidatos.map((c) => (
            <tr key={c.identificacion}>
              <td className={celda}>{c.nombre}</td>
              <td className={`${celda} font-mono text-xs`}>{c.identificacion}</td>
              <td className={celdaNum}>{c.diasAcumulados}</td>
              <td className={celda}>{fecha(c.ultimaFechaHasta)}</td>
              <td className="px-3 py-2 font-mono text-xs">{c.nrosSugeridos.join(", ")}</td>
              <td className={celda}>
                {puede("marcar_tipo") && (
                  <Button size="sm" variant="outline" disabled={marcando !== null} onClick={() => marcar(c.identificacion, c.nrosSugeridos)}>
                    {marcando === c.identificacion ? "Marcando…" : "Marcar como tránsito"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Tabla>
      </Panel>
    </div>
  )
}

// ─── Licencias de maternidad (RF-07) ──────────────────────────────────────────

export function MaternidadTab() {
  const { items, datos } = useIncapacidades()
  const v = useMemo(() => (datos ? vistaMaternidad(items, datos.corte) : null), [items, datos])
  if (!v) return null
  const tono = (e: string) => (e === "Finalizada" ? "neutro" : e === "En curso: reintegro próximo" ? "alerta" : e === "Por iniciar" ? "info" : "bien") as "neutro" | "alerta" | "info" | "bien"

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Indicador etiqueta="Licencias en curso" valor={v.indicadores.enCurso} />
        <Indicador etiqueta="Reintegros en 30 días" valor={v.indicadores.reintegrosProximos} tono={v.indicadores.reintegrosProximos ? "alerta" : "neutro"} />
        <Indicador etiqueta="Por iniciar" valor={v.indicadores.porIniciar} />
        <Indicador etiqueta="Saldo por cobrar" valor={pesos(v.indicadores.saldoPorCobrar)} />
        <Indicador etiqueta="En mora" valor={v.indicadores.enMora} tono={v.indicadores.enMora ? "peligro" : "neutro"} />
      </div>
      <Panel titulo="Licencias de maternidad">
        <Tabla encabezados={["Colaboradora", "Nº", "EPS", "Desde", "Hasta", "Reintegro", "Días restantes", "Estado", "Fin lactancia", "Valor", "Rad. EPS", "Saldo", "Alerta"]} vacio="Sin licencias de maternidad.">
          {[...v.filas].sort((a, b) => b.item.inc.fechaDesde.localeCompare(a.item.inc.fechaDesde)).map((f) => (
            <tr key={f.item.inc.id}>
              <td className={celda}>{f.item.inc.nombre}</td>
              <td className={`${celda} font-mono text-xs`}>{f.item.inc.nroIncapacidad}</td>
              <td className={celda}>{f.item.inc.eps ?? "—"}</td>
              <td className={celda}>{fecha(f.item.inc.fechaDesde)}</td>
              <td className={celda}>{fecha(f.item.inc.fechaHasta)}</td>
              <td className={celda}>{fecha(f.fechaReintegro)}</td>
              <td className={celdaNum}>{f.diasRestantes}</td>
              <td className={celda}><Etiqueta tono={tono(f.estado)}>{f.estado}</Etiqueta></td>
              <td className={celda}>{fecha(f.finLactancia)}</td>
              <td className={celdaNum}>{pesos(f.item.cobro.valor)}</td>
              <td className={celda}>{fecha(f.item.inc.fechaRadicacionEps)}</td>
              <td className={celdaNum}>{pesos(f.item.cobro.saldo)}</td>
              <td className={celda}><EtiquetaAlerta alerta={f.item.cobro.alerta} /></td>
            </tr>
          ))}
        </Tabla>
      </Panel>
    </div>
  )
}
