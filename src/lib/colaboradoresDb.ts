import type { SupabaseClient } from "@supabase/supabase-js"
import type { Colaborador } from "@/src/types/colaborador"

/** Solo servidor (service role). Mapea la tabla `colaboradores` al tipo de la app. */

const COLUMNAS = "identificacion, nombre, cargo, sede, fondo_pensiones, activo"

type FilaColaborador = {
  identificacion: string
  nombre: string
  cargo: string | null
  sede: string | null
  fondo_pensiones: string | null
  activo: boolean
}

export const aColaborador = (f: FilaColaborador): Colaborador => ({
  cedula: f.identificacion,
  nombre: f.nombre,
  cargo: f.cargo,
  sede: f.sede,
  fondoPensiones: f.fondo_pensiones,
  activo: f.activo,
})

/** Lee todos los colaboradores paginando (PostgREST limita a 1000 filas por consulta). */
export async function listarColaboradores(db: SupabaseClient): Promise<Colaborador[]> {
  const PAGINA = 1000
  const salida: Colaborador[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await db
      .from("colaboradores")
      .select(COLUMNAS)
      .order("nombre")
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    salida.push(...(data as FilaColaborador[]).map(aColaborador))
    if (!data || data.length < PAGINA) return salida
  }
}

export async function obtenerColaborador(db: SupabaseClient, cedula: string): Promise<Colaborador | null> {
  const { data, error } = await db.from("colaboradores").select(COLUMNAS).eq("identificacion", cedula).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? aColaborador(data as FilaColaborador) : null
}

/** Lista de fondos válida (parámetro editable de Incapacidades). */
export async function listaFondos(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("incapacidad_parametros").select("valor").eq("clave", "lista_fondos").maybeSingle()
  if (error) throw new Error(error.message)
  return Array.isArray(data?.valor) ? (data!.valor as string[]) : []
}
