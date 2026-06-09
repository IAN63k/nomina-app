import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SOFFICE = process.env.SOFFICE_PATH || "soffice";

/** Convierte uno o más .docx a PDF usando LibreOffice headless. */
function convertir(dir: string, outDir: string, files: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Perfil de usuario aislado por petición para evitar bloqueos cuando
    // LibreOffice ya está abierto o hay conversiones concurrentes.
    const profile = `-env:UserInstallation=file://${join(dir, "lo_profile")}`;
    const args = [
      "--headless",
      "--norestore",
      profile,
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      ...files,
    ];
    const proc = spawn(SOFFICE, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e: NodeJS.ErrnoException) => {
      // El ejecutable de LibreOffice no está instalado / no se encontró.
      if (e.code === "ENOENT") reject(new Error("LIBREOFFICE_MISSING"));
      else reject(e);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `soffice salió con código ${code}`));
    });
  });
}

export async function POST(req: Request) {
  let work: string | null = null;
  try {
    const form = await req.formData();
    const incoming = form.getAll("files").filter((f): f is File => f instanceof File);
    if (incoming.length === 0) {
      return Response.json({ error: "No se recibieron archivos." }, { status: 400 });
    }

    work = join(tmpdir(), `cartas-pdf-${randomUUID()}`);
    const inDir = join(work, "in");
    const outDir = join(work, "out");
    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    // Guardar cada .docx con un nombre único pero recordando el original.
    const mapa: { docx: string; base: string }[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const file = incoming[i];
      const base = file.name.replace(/\.docx$/i, "");
      const safe = `${String(i).padStart(4, "0")}.docx`;
      const path = join(inDir, safe);
      await writeFile(path, Buffer.from(await file.arrayBuffer()));
      mapa.push({ docx: path, base });
    }

    await convertir(work, outDir, mapa.map((m) => m.docx));

    const generados = (await readdir(outDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (generados.length === 0) {
      throw new Error("LibreOffice no generó ningún PDF.");
    }

    // Un solo archivo -> devolver el PDF directamente.
    if (mapa.length === 1) {
      const pdf = await readFile(join(outDir, "0000.pdf"));
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(mapa[0].base)}.pdf"`,
        },
      });
    }

    // Varios -> empaquetar en ZIP conservando los nombres originales.
    const zip = new JSZip();
    const usados = new Map<string, number>();
    for (let i = 0; i < mapa.length; i++) {
      const pdfPath = join(outDir, `${String(i).padStart(4, "0")}.pdf`);
      let nombre = mapa[i].base;
      const previo = usados.get(nombre) ?? 0;
      usados.set(nombre, previo + 1);
      if (previo > 0) nombre = `${nombre}_${previo + 1}`;
      zip.file(`${nombre}.pdf`, await readFile(pdfPath));
    }
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(new Uint8Array(blob), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cartas_vacaciones.zip"`,
      },
    });
  } catch (err) {
    const raw = (err as Error).message || "";
    if (raw === "LIBREOFFICE_MISSING") {
      return Response.json(
        {
          error:
            "La conversión a PDF requiere LibreOffice instalado en el servidor. " +
            "Descarga las cartas en Word, o instala LibreOffice e inténtalo de nuevo.",
          code: "libreoffice_missing",
        },
        { status: 503 }
      );
    }
    return Response.json(
      { error: raw || "No se pudo convertir a PDF.", code: "pdf_error" },
      { status: 500 }
    );
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
