import { NextResponse } from "next/server"
import { ErrorHttp, ruta, sinError } from "@/src/lib/apiIncapacidades"

const ESTADOS = ["Pendiente", "Atendida"]
const TIPOS = ["hito", "previa", "pqrd_vencida"]

/** RF-08: panel de alertas, filtrable por estado (Pendiente/Atendida) y tipo. */
export const GET = ruta("ver", async ({ req, db }) => {
  const estado = req.nextUrl.searchParams.get("estado")
  const tipo = req.nextUrl.searchParams.get("tipo")
  if (estado && !ESTADOS.includes(estado)) throw new ErrorHttp(400, "Estado de alerta no válido")
  if (tipo && !TIPOS.includes(tipo)) throw new ErrorHttp(400, "Tipo de alerta no válido")

  let q = db.from("incapacidad_alertas")
    .select("id, tipo, identificacion, nombre, cadena, hito, dias_acumulados, fecha_cumplimiento, incapacidad_id, pqrd_id, eps, accion_sugerida, estado, atendida_por, atendida_at, nota, created_at, incapacidades(nro_incapacidad)")
    .order("created_at", { ascending: false })
    .order("hito", { ascending: false })
    .limit(5000)
  if (estado) q = q.eq("estado", estado)
  if (tipo) q = q.eq("tipo", tipo)
  return NextResponse.json({ alertas: sinError(await q) })
})
