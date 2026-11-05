"use client"

import { useRouter } from "next/navigation"
import { HeartPulse, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useLocalStorageState } from "@/src/hooks/useLocalStorageState"
import { IncapacidadesProvider, useIncapacidades } from "@/components/incapacidades/incapacidades-context"
import { SeguimientoTab } from "@/components/incapacidades/seguimiento-tab"
import { CargarTab } from "@/components/incapacidades/cargar-tab"
import { MaternidadTab, ResumenTab, TransitoTab } from "@/components/incapacidades/vistas-tabs"
import { AlertasTab, ParametrosTab, PqrdTab } from "@/components/incapacidades/gestion-tabs"
import { Aviso, Cargando } from "@/components/incapacidades/ui"
import { fecha } from "@/components/incapacidades/formato"

const PESTANAS = [
  { id: "seguimiento", texto: "Seguimiento" },
  { id: "cargar", texto: "Cargar archivo" },
  { id: "resumen", texto: "Resumen" },
  { id: "transito", texto: "Accidentes de tránsito" },
  { id: "maternidad", texto: "Licencias de maternidad" },
  { id: "pqrd", texto: "PQRD" },
  { id: "alertas", texto: "Alertas" },
  { id: "parametros", texto: "Parámetros" },
] as const
type Pestana = (typeof PESTANAS)[number]["id"]

export default function IncapacidadesPage() {
  return (
    <IncapacidadesProvider>
      <Contenido />
    </IncapacidadesProvider>
  )
}

function Contenido() {
  const { estado, error, datos, items, puede } = useIncapacidades()
  const { logout } = useAuth()
  const router = useRouter()
  const [pestana, setPestana] = useLocalStorageState<Pestana>("incapacidades:pestana", "seguimiento")
  const visibles = PESTANAS.filter((p) => p.id !== "parametros" || puede("editar_parametros"))
  const actual = visibles.some((p) => p.id === pestana) ? pestana : "seguimiento"
  const pendientesRevisar = items.filter((x) => x.inc.paraRevisar.length > 0).length

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <HeartPulse className="h-3.5 w-3.5" />
              Módulo de Incapacidades
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Seguimiento de incapacidades</h1>
            <p className="mt-2 text-muted-foreground">
              Carga el reporte de KactuS, gestiona el cobro a EPS y fondos de pensiones, y atiende las alertas de 90, 120, 150 y 180 días.
              {datos && <> Corte: <strong>{fecha(datos.corte)}</strong>.</>}
              {pendientesRevisar > 0 && <> {pendientesRevisar} incapacidad(es) marcadas para revisar.</>}
            </p>
          </div>
          <nav aria-label="Secciones de incapacidades" className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {visibles.map((p) => (
              <Button key={p.id} size="sm" variant={actual === p.id ? "default" : "ghost"} aria-current={actual === p.id ? "page" : undefined} onClick={() => setPestana(p.id)}>
                {p.texto}
              </Button>
            ))}
          </nav>
        </div>
      </section>

      {estado === "sin_sesion" && (
        <Aviso tipo="alerta">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Tu sesión venció o es de una versión anterior. Inicia sesión de nuevo para ver las incapacidades.</span>
            <Button size="sm" variant="outline" onClick={async () => { await logout(); router.push("/login") }}>
              <LogIn /> Iniciar sesión
            </Button>
          </div>
        </Aviso>
      )}
      {estado === "error" && <Aviso tipo="error">{error}</Aviso>}
      {estado === "cargando" && <Cargando texto="Cargando incapacidades…" />}

      {estado === "listo" && (
        <>
          {actual === "seguimiento" && <SeguimientoTab />}
          {actual === "cargar" && <CargarTab />}
          {actual === "resumen" && <ResumenTab />}
          {actual === "transito" && <TransitoTab />}
          {actual === "maternidad" && <MaternidadTab />}
          {actual === "pqrd" && <PqrdTab />}
          {actual === "alertas" && <AlertasTab />}
          {actual === "parametros" && <ParametrosTab />}
        </>
      )}
    </div>
  )
}
