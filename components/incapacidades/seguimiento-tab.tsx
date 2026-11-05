"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, FilterX, MessageSquareWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLocalStorageState } from "@/src/hooks/useLocalStorageState"
import type { AlertaCobro } from "@/src/types/incapacidad"
import { pedir, mensajeDe } from "./api"
import { DetalleIncapacidad } from "./detalle-incapacidad"
import { fecha, normalizar, numero, pesos } from "./formato"
import { useIncapacidades, type ItemSeguimiento } from "./incapacidades-context"
import { Aviso, Campo, Entrada, EtiquetaAlerta, Etiqueta, Panel, Selector, celda, celdaNum } from "./ui"

const ALERTAS: AlertaCobro[] = ["Riesgo prescripción", "Rechazada: gestionar", "Pago menor al valor", "En mora", "Al día", "Cerrada"]
const POR_PAGINA = 50

interface Filtros {
  texto: string
  entidad: string
  estado: string
  alerta: string
  tipo: string
  desde: string
  hasta: string
  soloRevisar: boolean
  orden: "reciente" | "saldo" | "mora" | "nombre"
}
const FILTROS_INICIALES: Filtros = { texto: "", entidad: "", estado: "", alerta: "", tipo: "", desde: "", hasta: "", soloRevisar: false, orden: "reciente" }

const ORDENES: Record<Filtros["orden"], (a: ItemSeguimiento, b: ItemSeguimiento) => number> = {
  reciente: (a, b) => b.inc.fechaHasta.localeCompare(a.inc.fechaHasta),
  saldo: (a, b) => b.cobro.saldo - a.cobro.saldo,
  mora: (a, b) => (b.cobro.diasDesdeRadicacion ?? -1) - (a.cobro.diasDesdeRadicacion ?? -1),
  nombre: (a, b) => a.inc.nombre.localeCompare(b.inc.nombre),
}

export function SeguimientoTab() {
  const { items, datos, puede } = useIncapacidades()
  const [f, setF] = useLocalStorageState<Filtros>("incapacidades:filtros", FILTROS_INICIALES)
  const [pagina, setPagina] = useState(0)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)
  const filtros = { ...FILTROS_INICIALES, ...f }
  const cambiar = (c: Partial<Filtros>) => { setF({ ...filtros, ...c }); setPagina(0) }

  const entidades = useMemo(
    () => [...new Set(items.flatMap((x) => x.cobro.tramos.map((t) => t.entidad)))].sort(),
    [items],
  )

  const filtrados = useMemo(() => {
    const q = normalizar(filtros.texto)
    return items
      .filter((x) => {
        const { inc, cobro } = x
        if (q && !normalizar(`${inc.nombre} ${inc.identificacion} ${inc.nroIncapacidad}`).includes(q)) return false
        if (filtros.entidad && !cobro.tramos.some((t) => t.entidad === filtros.entidad)) return false
        if (filtros.estado && inc.estado !== filtros.estado) return false
        if (filtros.alerta && cobro.alerta !== filtros.alerta) return false
        if (filtros.tipo && inc.tipo !== filtros.tipo) return false
        if (filtros.desde && inc.fechaHasta < filtros.desde) return false
        if (filtros.hasta && inc.fechaDesde > filtros.hasta) return false
        if (filtros.soloRevisar && inc.paraRevisar.length === 0 && cobro.avisos.length === 0) return false
        return true
      })
      .sort(ORDENES[filtros.orden])
  }, [items, filtros.texto, filtros.entidad, filtros.estado, filtros.alerta, filtros.tipo, filtros.desde, filtros.hasta, filtros.soloRevisar, filtros.orden])

  const totales = useMemo(() => filtrados.reduce(
    (t, x) => ({ valor: t.valor + x.cobro.valor, pagado: t.pagado + x.cobro.pagado, saldo: t.saldo + x.cobro.saldo }),
    { valor: 0, pagado: 0, saldo: 0 },
  ), [filtrados])

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const pag = Math.min(pagina, paginas - 1)
  const visibles = filtrados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA)
  const puedeEditar = puede("editar_seguimiento")
  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((x) => seleccion.has(x.inc.id!))

  const alternar = (id: string) => setSeleccion((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const alternarPagina = () => setSeleccion((s) => {
    const n = new Set(s)
    for (const x of visibles) {
      if (todasVisiblesMarcadas) n.delete(x.inc.id!)
      else n.add(x.inc.id!)
    }
    return n
  })

  if (!datos) return null
  const { params } = datos

  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Campo etiqueta="Buscar" className="sm:col-span-2">
            <Entrada placeholder="Colaborador, identificación o Nº" value={filtros.texto} onChange={(e) => cambiar({ texto: e.target.value })} />
          </Campo>
          <Campo etiqueta="Entidad de cobro">
            <Selector vacio="Todas" opciones={entidades} value={filtros.entidad} onChange={(e) => cambiar({ entidad: e.target.value })} />
          </Campo>
          <Campo etiqueta="Estado">
            <Selector vacio="Todos" opciones={params.listaEstados} value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value })} />
          </Campo>
          <Campo etiqueta="Alerta">
            <Selector vacio="Todas" opciones={ALERTAS} value={filtros.alerta} onChange={(e) => cambiar({ alerta: e.target.value })} />
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector vacio="Todos" opciones={params.listaTipos} value={filtros.tipo} onChange={(e) => cambiar({ tipo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Vigente desde">
            <Entrada type="date" value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
          </Campo>
          <Campo etiqueta="Vigente hasta">
            <Entrada type="date" value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </Campo>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={filtros.soloRevisar} onChange={(e) => cambiar({ soloRevisar: e.target.checked })} />
              Solo para revisar
            </label>
            <label className="inline-flex items-center gap-2 whitespace-nowrap">
              Ordenar por
              <Selector
                className="h-8 w-auto"
                opciones={[
                  { valor: "reciente", texto: "Más recientes" },
                  { valor: "saldo", texto: "Mayor saldo" },
                  { valor: "mora", texto: "Más días desde radicación" },
                  { valor: "nombre", texto: "Colaborador" },
                ]}
                value={filtros.orden}
                onChange={(e) => cambiar({ orden: e.target.value as Filtros["orden"] })}
              />
            </label>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setF(FILTROS_INICIALES); setPagina(0) }}>
            <FilterX /> Limpiar filtros
          </Button>
        </div>
      </Panel>

      {puedeEditar && seleccion.size > 0 && (
        <CambioMasivo ids={[...seleccion]} onListo={() => setSeleccion(new Set())} />
      )}

      <Panel
        titulo={`${numero(filtrados.length)} incapacidades`}
        descripcion={<>Valor {pesos(totales.valor)} · Pagado {pesos(totales.pagado)} · Saldo <strong>{pesos(totales.saldo)}</strong> · Corte {fecha(datos.corte)}</>}
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {puedeEditar && (
                  <th className="px-3 py-2">
                    <input type="checkbox" aria-label="Seleccionar página" checked={todasVisiblesMarcadas} onChange={alternarPagina} />
                  </th>
                )}
                {["Colaborador", "Nº incapacidad", "Entidad de cobro", "Tipo", "Días", "Fechas", "Valor", "Pagado", "Saldo", "Estado", "Alerta", "Últ. gestión"].map((h) => (
                  <th key={h} className={`whitespace-nowrap px-3 py-2 font-semibold ${["Valor", "Pagado", "Saldo"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibles.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Ninguna incapacidad con estos filtros.</td></tr>
              )}
              {visibles.map((x) => {
                const { inc, cobro } = x
                const revisar = inc.paraRevisar.length + cobro.avisos.length > 0
                return (
                  <tr key={inc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setAbierta(inc.id!)}>
                    {puedeEditar && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Seleccionar ${inc.nroIncapacidad}`} checked={seleccion.has(inc.id!)} onChange={() => alternar(inc.id!)} />
                      </td>
                    )}
                    <td className="min-w-60 px-3 py-2">
                      <div className="font-medium">{inc.nombre}</div>
                      <div className="font-mono text-xs text-muted-foreground">{inc.identificacion}</div>
                    </td>
                    <td className={celda}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{inc.nroIncapacidad}</span>
                        {revisar && <span title={[...inc.paraRevisar, ...cobro.avisos].join("\n")}><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></span>}
                      </div>
                      {x.pqrdAbierta && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400">
                          <MessageSquareWarning className="h-3 w-3" /> PQRD {x.pqrdAbierta.radicado}
                        </span>
                      )}
                    </td>
                    <td className={celda}>{cobro.tramos.map((t) => t.entidad).join(" + ")}</td>
                    <td className={celda}>{inc.tipo}</td>
                    <td className={celdaNum}>
                      {inc.dias}
                      <span className="block text-xs text-muted-foreground">{inc.diasAcumulados} acum.{inc.esProrroga ? " · prórroga" : ""}</span>
                    </td>
                    <td className={celda}>
                      {fecha(inc.fechaDesde)}
                      <span className="block text-xs text-muted-foreground">al {fecha(inc.fechaHasta)}</span>
                    </td>
                    <td className={celdaNum}>{pesos(cobro.valor)}</td>
                    <td className={celdaNum}>{pesos(cobro.pagado)}</td>
                    <td className={`${celdaNum} font-medium`}>{pesos(cobro.saldo)}</td>
                    <td className={celda}><Etiqueta>{inc.estado}</Etiqueta></td>
                    <td className={celda}>
                      <EtiquetaAlerta alerta={cobro.alerta} />
                      {cobro.diasDesdeRadicacion !== null && <span className="block text-xs text-muted-foreground">{cobro.diasDesdeRadicacion} días</span>}
                    </td>
                    <td className={celda}>{fecha(x.ultimaGestion)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{seleccion.size > 0 ? `${seleccion.size} seleccionada(s)` : `Página ${pag + 1} de ${paginas}`}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={pag === 0} onClick={() => setPagina(pag - 1)}><ChevronLeft /></Button>
            <Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}><ChevronRight /></Button>
          </div>
        </div>
      </Panel>

      <DetalleIncapacidad id={abierta} onCerrar={() => setAbierta(null)} />
    </div>
  )
}

/** Registro masivo: mismo cambio a varias incapacidades (todo o nada). */
function CambioMasivo({ ids, onListo }: { ids: string[]; onListo: () => void }) {
  const { datos, recargar } = useIncapacidades()
  const [campo, setCampo] = useState<"estado" | "fechaRadicacionEps" | "responsable">("estado")
  const [estado, setEstado] = useState("")
  const [causal, setCausal] = useState("")
  const [valor, setValor] = useState("")
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ nroIncapacidad: string; error: string }[]>([])
  if (!datos) return null

  const aplicar = async () => {
    setEnviando(true); setError(null); setDetalle([])
    const cambios: Record<string, string | null> =
      campo === "estado"
        ? { estado, ...(causal ? { causalNoPago: causal } : {}), ...(motivo ? { motivo } : {}) }
        : { [campo]: valor || null }
    try {
      await pedir("/api/incapacidades/masivo", { method: "PATCH", body: { ids, cambios } })
      await recargar()
      onListo()
    } catch (e) {
      setError(mensajeDe(e))
      const extra = (e as { extra?: { errores?: { nroIncapacidad: string; error: string }[] } }).extra
      setDetalle(extra?.errores ?? [])
    } finally {
      setEnviando(false)
    }
  }

  const listo = campo === "estado" ? Boolean(estado) : true
  return (
    <Panel titulo={`Cambio masivo a ${ids.length} incapacidad(es)`} descripcion="Si alguna no admite el cambio, no se cambia ninguna.">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Campo etiqueta="Qué cambiar">
          <Selector
            opciones={[{ valor: "estado", texto: "Estado" }, { valor: "fechaRadicacionEps", texto: "Fecha radicación EPS" }, { valor: "responsable", texto: "Responsable" }]}
            value={campo}
            onChange={(e) => setCampo(e.target.value as typeof campo)}
          />
        </Campo>
        {campo === "estado" ? (
          <>
            <Campo etiqueta="Nuevo estado"><Selector vacio="Elegir…" opciones={datos.params.listaEstados} value={estado} onChange={(e) => setEstado(e.target.value)} /></Campo>
            <Campo etiqueta="Causal (si aplica)"><Selector vacio="—" opciones={datos.params.listaCausales} value={causal} onChange={(e) => setCausal(e.target.value)} /></Campo>
            <Campo etiqueta="Motivo (si aplica)"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          </>
        ) : (
          <Campo etiqueta={campo === "responsable" ? "Responsable" : "Fecha radicación EPS"} className="lg:col-span-3">
            <Entrada type={campo === "responsable" ? "text" : "date"} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
        )}
        <div className="flex gap-2">
          <Button onClick={aplicar} disabled={!listo || enviando}>{enviando ? "Aplicando…" : "Aplicar"}</Button>
          <Button variant="ghost" onClick={onListo}>Cancelar</Button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Aviso tipo="error">
            {error}
            {detalle.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {detalle.slice(0, 10).map((d) => <li key={d.nroIncapacidad}>{d.nroIncapacidad}: {d.error}</li>)}
              </ul>
            )}
          </Aviso>
        </div>
      )}
    </Panel>
  )
}
