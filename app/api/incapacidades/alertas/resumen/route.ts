import { NextResponse } from "next/server"
import { ruta } from "@/src/lib/apiIncapacidades"
import { resumenAlertas } from "@/src/lib/incapacidadesDb"
import { estadoTareaDiaria } from "@/src/services/tareaDiaria"

/** Contador de pendientes (menú lateral) y estado de la tarea diaria (aviso en Alertas). */
export const GET = ruta("ver", async ({ db }) => {
  const { pendientes, ejecucionesCron } = await resumenAlertas(db)
  return NextResponse.json({ pendientes, tarea: estadoTareaDiaria(ejecucionesCron) })
})
