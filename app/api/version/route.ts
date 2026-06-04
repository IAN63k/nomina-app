import { NextResponse } from "next/server"
import { readFileSync } from "node:fs"
import path from "node:path"

// Versión actualmente desplegada (la del servidor). El cliente la compara contra la
// versión "horneada" en su bundle (NEXT_PUBLIC_APP_VERSION) para detectar un deploy nuevo.
export const dynamic = "force-dynamic"

export function GET() {
  let version = "unknown"
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string }
    version = pkg.version
  } catch {
    // package.json no disponible en runtime → se mantiene "unknown"
  }

  return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store, max-age=0" } })
}
