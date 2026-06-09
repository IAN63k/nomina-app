/**
 * Generador de cartas de vacaciones (mail merge sobre plantilla .docx).
 *
 * Replica el comportamiento del script Python `generar_cartas.py`:
 * toma una plantilla de Word con marcadores entre llaves —p. ej. {NOMBRE} o
 * {PERIODO 1}— y un Excel cuya fila de encabezados usa exactamente esos mismos
 * nombres. Por cada fila con datos genera una carta reemplazando los marcadores,
 * conservando el formato de la plantilla (docxtemplater trabaja sobre los runs).
 */

import * as XLSX from "xlsx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import JSZip from "jszip";

// --- Configuración por defecto ---------------------------------------------

/** Hoja del Excel cuyos encabezados coinciden con los marcadores de la carta. */
export const HOJA_DEFECTO = "PROGRAMACION";

/** Plantilla incluida en el proyecto (carpeta `public`). */
export const PLANTILLA_DEFECTO_URL = "/templates/carta_vacaciones.docx";

/**
 * Columnas cuyas fechas se muestran en formato corto dd/mm/aaaa en lugar del
 * formato largo en español ("1 de junio de 2026").
 */
export const COLUMNAS_FECHA_CORTA = new Set(["PERIODO 1", "PERIODO 2"]);

/**
 * Marcador especial que NO viene del Excel ni del formulario individual: lo
 * ajusta el usuario desde el módulo (mes + año) y se inyecta en cada carta.
 * Corresponde al encabezado "Santiago de Cali, {FECHACARTA}".
 */
export const MARCADOR_FECHA = "FECHACARTA";

export const MESES_ES = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Columnas que identifican a un empleado real. Una fila solo genera carta si al
 * menos una de estas columnas tiene valor; así se descartan las filas "vacías"
 * que arrastran algún dato suelto (un 0, una fecha residual, restos de fórmula)
 * pero no corresponden a ninguna persona.
 */
const COLUMNAS_IDENTIDAD = ["NOMBRE", "APELLIDO", "CEDULA"];

// --- Tipos -------------------------------------------------------------------

export type CartaRow = {
  /** Índice de la fila dentro de la hoja (1 = primera fila de datos). */
  index: number;
  /** Valores crudos de cada celda, indexados por encabezado. */
  raw: Record<string, unknown>;
  /** Valores ya formateados como texto, listos para la carta. */
  values: Record<string, string>;
};

export type SheetData = {
  headers: string[];
  rows: CartaRow[];
};

// --- Utilidades de formato ---------------------------------------------------

/** Indica si un valor de celda debe considerarse vacío. */
function estaVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  // Las fechas anteriores a 1900 corresponden al origen de Excel (30/12/1899),
  // que se usa para celdas de fecha sin valor real.
  if (valor instanceof Date) return valor.getFullYear() < 1900;
  if (typeof valor === "string") return valor.trim() === "";
  return false;
}

/** Convierte un valor de celda en texto apto para la carta. */
function formatearValor(valor: unknown, fechaCorta: boolean): string {
  if (valor === null || valor === undefined) return "";

  if (valor instanceof Date) {
    const d = valor.getDate();
    const m = valor.getMonth() + 1;
    const y = valor.getFullYear();
    if (fechaCorta) {
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
    // En formato largo, una fecha anterior a 1900 se trata como vacía.
    if (y < 1900) return "";
    return `${d} de ${MESES_ES[m]} de ${y}`;
  }

  if (typeof valor === "number") {
    return Number.isInteger(valor) ? String(valor) : String(valor);
  }

  if (typeof valor === "boolean") return valor ? "Sí" : "No";

  return String(valor).trim();
}

function formatearFila(
  raw: Record<string, unknown>,
  headers: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    out[h] = formatearValor(raw[h], COLUMNAS_FECHA_CORTA.has(h));
  }
  return out;
}

/**
 * Marcador {SALDO} de la carta: días restantes = DIAS_TIENE − DIAS_TOMA. No es
 * una columna del Excel ni un campo obligatorio; se calcula a partir de los días
 * (una celda vacía cuenta como 0). Devuelve "" si ninguno tiene valor o si alguno
 * no es numérico. Lo usan tanto la lectura del Excel como el alta individual.
 */
export const CAMPO_SALDO = "SALDO";

export function calcularSaldoDias(tiene: string, toma: string): string {
  const t = (tiene ?? "").trim();
  const m = (toma ?? "").trim();
  if (!t && !m) return "";
  const nt = t === "" ? 0 : Number(t.replace(",", "."));
  const nm = m === "" ? 0 : Number(m.replace(",", "."));
  if (!Number.isFinite(nt) || !Number.isFinite(nm)) return "";
  return String(nt - nm);
}

/**
 * Texto del marcador {FECHACARTA} a partir del mes (1–12) y el año elegidos en
 * el módulo. P. ej. (6, 2026) → "junio de 2026" (mes en minúscula).
 */
export function fechaCartaTexto(mes: number, anio: number): string {
  return `${MESES_ES[mes] ?? ""} de ${anio}`;
}

/** Deja un texto seguro para usarlo como nombre de archivo. */
export function limpiarNombreArchivo(texto: string): string {
  const limpio = String(texto)
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return limpio ? limpio.slice(0, 120) : "sin_nombre";
}

// --- Lectura del Excel -------------------------------------------------------

export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(data, { type: "array", cellDates: true });
}

export function listSheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames;
}

/** Elige la hoja preferida si existe; si no, la primera. */
export function pickSheet(wb: XLSX.WorkBook, preferida = HOJA_DEFECTO): string {
  return wb.SheetNames.includes(preferida) ? preferida : wb.SheetNames[0];
}

/**
 * Extrae encabezados y filas con datos de una hoja. Ignora columnas sin
 * encabezado y omite las filas completamente vacías (igual que el Python).
 */
export function extractSheet(wb: XLSX.WorkBook, sheetName: string): SheetData {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { headers: [], rows: [] };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const rawHeaders = (matrix[0] as unknown[]).map((h) =>
    h === null || h === undefined ? "" : String(h).trim()
  );
  const cols = rawHeaders
    .map((h, i) => ({ h, i }))
    .filter((c) => c.h !== "" && !c.h.startsWith("__EMPTY"));
  const headers = cols.map((c) => c.h);

  // Si la hoja tiene columnas de identidad, exigimos al menos una con valor;
  // si no, basta con que la fila tenga algún dato.
  const tieneColsIdentidad = headers.some((h) => COLUMNAS_IDENTIDAD.includes(h));

  const rows: CartaRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const arr = matrix[r] as unknown[];
    const raw: Record<string, unknown> = {};
    let tieneDatos = false;
    let tieneIdentidad = false;
    for (const c of cols) {
      const v = arr[c.i] ?? null;
      raw[c.h] = v;
      if (!estaVacio(v)) {
        tieneDatos = true;
        if (COLUMNAS_IDENTIDAD.includes(c.h)) tieneIdentidad = true;
      }
    }
    const conservar = tieneColsIdentidad ? tieneIdentidad : tieneDatos;
    if (conservar) {
      const values = formatearFila(raw, headers);
      // Si la hoja no trae una columna SALDO, lo derivamos de los días para que
      // el marcador {SALDO} de la carta no quede en blanco.
      if (!headers.includes(CAMPO_SALDO)) {
        values[CAMPO_SALDO] = calcularSaldoDias(values["DIAS_TIENE"] ?? "", values["DIAS_TOMA"] ?? "");
      }
      rows.push({ index: r, raw, values });
    }
  }

  return { headers, rows };
}

// --- Plantilla y generación de cartas ---------------------------------------

export async function fetchPlantillaDefecto(): Promise<ArrayBuffer> {
  const res = await fetch(PLANTILLA_DEFECTO_URL);
  if (!res.ok) {
    throw new Error("No se pudo cargar la plantilla incluida en el proyecto.");
  }
  return res.arrayBuffer();
}

// Opciones de docxtemplater. Un parser literal permite marcadores con espacios
// o puntos (p. ej. {PERIODO 1}, {C.T}); nullGetter deja en blanco los que no
// tienen columna en el Excel en lugar de lanzar un error.
const DOCX_OPTIONS = {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: "{", end: "}" },
  parser: (tag: string) => ({
    get: (scope: Record<string, unknown> | null) =>
      scope ? scope[tag] : undefined,
  }),
  nullGetter: () => "",
};

/** Devuelve los marcadores {ENTRE_LLAVES} presentes en la plantilla. */
export function extraerMarcadores(templateBuf: ArrayBuffer): string[] {
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, DOCX_OPTIONS);
  const texto = doc.getFullText();
  const set = new Set<string>();
  for (const match of texto.matchAll(/\{([^{}]+)\}/g)) {
    set.add(match[1]);
  }
  return [...set].sort();
}

/** Marcadores de la plantilla que no tienen una columna con el mismo nombre. */
export function marcadoresSinColumna(
  marcadores: string[],
  headers: string[]
): string[] {
  const set = new Set(headers);
  return marcadores.filter((m) => !set.has(m));
}

/** Renderiza una carta a partir de los valores de una fila. */
export function renderCarta(
  templateBuf: ArrayBuffer,
  values: Record<string, string>
): Uint8Array {
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, DOCX_OPTIONS);
  doc.render(values);
  return doc.getZip().generate({ type: "uint8array" });
}

/** Nombre del archivo de una carta: NOMBRE APELLIDO, o fila_N como respaldo. */
export function nombreCarta(row: CartaRow): string {
  const partes = [row.values["NOMBRE"], row.values["APELLIDO"]]
    .filter((p) => p && p.trim())
    .join(" ");
  return limpiarNombreArchivo(partes || `fila_${row.index}`);
}

export function cartaBlob(templateBuf: ArrayBuffer, row: CartaRow): Blob {
  const bytes = renderCarta(templateBuf, row.values);
  return new Blob([bytes as unknown as BlobPart], { type: MIME_DOCX });
}

/** Genera un ZIP con una carta .docx por cada fila indicada. */
export async function generarZip(
  templateBuf: ArrayBuffer,
  rows: CartaRow[]
): Promise<Blob> {
  const zip = new JSZip();
  const usados = new Map<string, number>();

  for (const row of rows) {
    let nombre = nombreCarta(row);
    const previo = usados.get(nombre) ?? 0;
    usados.set(nombre, previo + 1);
    if (previo > 0) nombre = `${nombre}_${previo + 1}`;
    zip.file(`${nombre}.docx`, renderCarta(templateBuf, row.values));
  }

  return zip.generateAsync({ type: "blob" });
}

/**
 * Convierte las cartas seleccionadas a PDF **en el navegador** (ver
 * `cartasPdfClient.ts`). Devuelve un PDF si es una sola carta o un ZIP de PDFs
 * si son varias. `onProgress(done, total)` permite mostrar el avance.
 */
export async function generarPdf(
  templateBuf: ArrayBuffer,
  rows: CartaRow[],
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; filename: string }> {
  const { docxToPdf } = await import("./cartasPdfClient");

  if (rows.length === 1) {
    onProgress?.(0, 1);
    const blob = await docxToPdf(renderCarta(templateBuf, rows[0].values));
    onProgress?.(1, 1);
    return { blob, filename: `${nombreCarta(rows[0])}.pdf` };
  }

  const zip = new JSZip();
  const usados = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i, rows.length);
    const pdf = await docxToPdf(renderCarta(templateBuf, rows[i].values));
    let nombre = nombreCarta(rows[i]);
    const previo = usados.get(nombre) ?? 0;
    usados.set(nombre, previo + 1);
    if (previo > 0) nombre = `${nombre}_${previo + 1}`;
    zip.file(`${nombre}.pdf`, await pdf.arrayBuffer());
  }
  onProgress?.(rows.length, rows.length);
  return { blob: await zip.generateAsync({ type: "blob" }), filename: "cartas_vacaciones.zip" };
}

/** Dispara la descarga de un Blob en el navegador. */
export function descargar(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
