import { NextResponse } from "next/server"
import { ErrorHttp, exigirUuid, ruta, sinError } from "@/src/lib/apiIncapacidades"
import { auditar } from "@/src/lib/incapacidadesDb"

const BUCKET = "incapacidades-soportes"
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" }
const MAX_BYTES = 10 * 1024 * 1024

/** Firma del archivo: no basta con el Content-Type que declara el navegador. */
function tipoReal(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  return null
}

/** Sube el soporte de la PQRD (PDF, PNG o JPG; máx. 10 MB) al bucket privado. */
export const POST = ruta<{ pqrdId: string }>("registrar_gestion", async ({ req, db, user }, { pqrdId }) => {
  exigirUuid(pqrdId, "PQRD")
  const pqrd = sinError(await db.from("incapacidad_pqrd").select("id, soporte_path").eq("id", pqrdId).maybeSingle())
  if (!pqrd) throw new ErrorHttp(404, "PQRD no encontrada")

  const form = await req.formData().catch(() => null)
  const archivo = form?.get("archivo")
  if (!(archivo instanceof File)) throw new ErrorHttp(400, "Falta el archivo (campo 'archivo')")
  if (archivo.size > MAX_BYTES) throw new ErrorHttp(400, "El soporte supera 10 MB")
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const tipo = tipoReal(bytes)
  if (!tipo) throw new ErrorHttp(400, "El soporte debe ser PDF, PNG o JPG")

  const ruta = `pqrd/${pqrdId}/${Date.now()}.${TIPOS[tipo]}`
  const { error } = await db.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipo, upsert: false })
  if (error) throw new Error(error.message)
  sinError(await db.from("incapacidad_pqrd").update({ soporte_path: ruta, updated_by: user.usuario, updated_at: new Date().toISOString() }).eq("id", pqrdId))
  await auditar(db, [{
    tabla: "incapacidad_pqrd", registro_id: pqrdId, accion: "soporte", campo: "soporte_path",
    valor_anterior: pqrd.soporte_path, valor_nuevo: ruta, usuario: user.usuario,
  }])
  return NextResponse.json({ ok: true }, { status: 201 })
})

/** Enlace temporal (60 s) para ver el soporte; el bucket nunca es público. */
export const GET = ruta<{ pqrdId: string }>("ver", async ({ db }, { pqrdId }) => {
  exigirUuid(pqrdId, "PQRD")
  const pqrd = sinError(await db.from("incapacidad_pqrd").select("soporte_path").eq("id", pqrdId).maybeSingle())
  if (!pqrd?.soporte_path) throw new ErrorHttp(404, "La PQRD no tiene soporte")
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(pqrd.soporte_path, 60)
  if (error || !data) throw new Error(error?.message ?? "No se pudo firmar el enlace")
  return NextResponse.json({ url: data.signedUrl })
})
