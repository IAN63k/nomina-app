import type { SupabaseClient } from "@supabase/supabase-js"
import { exigir, sinError } from "@/src/lib/apiIncapacidades"
import { auditar, cobroDeIncapacidad, evaluarAlertas, leerParametros, obtenerIncapacidad } from "@/src/lib/incapacidadesDb"
import { hoyBogota } from "@/src/services/incapacidadesEngine"
import { validarEdicion } from "@/src/services/incapacidadesValidacion"
import type { Incapacidad, ParametrosIncapacidades } from "@/src/types/incapacidad"

/** Edición de seguimiento (individual y masiva). Solo servidor. */

const CAMPO_APP: Record<string, keyof Incapacidad> = {
  fecha_radicacion_eps: "fechaRadicacionEps",
  estado: "estado",
  causal_no_pago: "causalNoPago",
  responsable: "responsable",
  tipo: "tipo",
  es_prorroga: "esProrroga",
  dias_acumulados: "diasAcumulados",
  valor_fondo_manual: "valorFondoManual",
  observacion: "observacion",
}

/**
 * Edita los campos digitables. Cada cambio queda en la auditoría; los cambios
 * de estado quedan además en el historial de gestiones con su motivo.
 */
export async function aplicarEdicion(
  db: SupabaseClient,
  actual: Incapacidad,
  body: unknown,
  usuario: string,
  opciones: { params?: ParametrosIncapacidades; evaluar?: boolean } = {},
) {
  const params = opciones.params ?? (await leerParametros(db))
  const hoy = hoyBogota()
  const { cambios, motivo, reevaluarAlertas } = exigir(validarEdicion(body, actual, params, hoy))

  sinError(await db.from("incapacidades")
    .update({ ...cambios, updated_by: usuario, updated_at: new Date().toISOString() })
    .eq("id", actual.id!))

  await auditar(db, Object.entries(cambios).map(([campo, nuevo]) => ({
    tabla: "incapacidades",
    registro_id: actual.id!,
    accion: "update",
    campo,
    valor_anterior: actual[CAMPO_APP[campo]] ?? null,
    valor_nuevo: nuevo,
    usuario,
  })))

  if (cambios.estado !== undefined && cambios.estado !== actual.estado) {
    sinError(await db.from("incapacidad_gestiones").insert({
      incapacidad_id: actual.id,
      fecha: hoy,
      tipo: "Cambio de estado",
      accion: `${actual.estado} → ${cambios.estado}${motivo ? `. Motivo: ${motivo}` : ""}`,
      created_by: usuario,
    }))
  }

  const alertas = reevaluarAlertas && opciones.evaluar !== false ? await evaluarAlertas(db) : null
  const inc = (await obtenerIncapacidad(db, actual.id!))!
  const { cobro } = await cobroDeIncapacidad(db, inc)
  return { incapacidad: inc, cobro, alertasNuevas: alertas?.nuevas ?? 0, reevaluarAlertas }
}

