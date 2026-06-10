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
  /**
   * Vacaciones capturadas a mano (solo filas manuales). Cuando está presente,
   * el bloque de la carta se arma con estos períodos en vez de buscarlos en la
   * hoja de acumulados; permite varios períodos y días compensados sin Excel.
   */
  vacaciones?: VacacionesManual;
};

/** Vacaciones de una persona agregada manualmente: períodos + toma + compensados. */
export type VacacionesManual = {
  periodos: { INICIO: string; FIN: string; DIAS: string }[];
  toma: string;
  compensados: string;
};

export type SheetData = {
  headers: string[];
  rows: CartaRow[];
};

/** Un período anual de vacaciones causado, leído de la hoja de acumulados. */
export type Periodo = {
  inicio: Date;
  fin: Date;
  /** Días acumulados (saldo causado) de ese período. */
  dias: number;
};

/** Períodos acumulados por empleado, indexados por cédula normalizada. */
export type AcumuladosMap = Map<string, Periodo[]>;

/**
 * Bloque de vacaciones que se inyecta en la carta: la lista de períodos
 * causados (para el bucle {#PERIODOS}) más el resumen Toma/Compensados/Saldo.
 * Los valores van como texto listo para la plantilla; `HAY_COMPENSADOS` es un
 * booleano que activa la sección {#HAY_COMPENSADOS}.
 */
export type DatosVacaciones = {
  PERIODOS: { INICIO: string; FIN: string; DIAS: string }[];
  TOMA: string;
  COMPENSADOS: string;
  SALDO_FINAL: string;
  HAY_COMPENSADOS: boolean;
};

/**
 * Marcadores que NO provienen de una columna del Excel: los calcula el motor de
 * vacaciones (bucle de períodos + resumen). Se excluyen del aviso "sin columna"
 * y del formulario manual, igual que {SALDO} y {FECHACARTA}.
 */
export const MARCADORES_CALCULADOS = new Set([
  "PERIODOS",
  "INICIO",
  "FIN",
  "DIAS",
  "TOMA",
  "COMPENSADOS",
  "SALDO_FINAL",
  "HAY_COMPENSADOS",
]);

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

// --- Vacaciones: períodos acumulados y resumen ------------------------------

/** Normaliza un encabezado para comparar sin acentos, mayúsculas ni puntos. */
function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.\s]+/g, " ")
    .trim();
}

/** Deja una cédula en solo dígitos para cruzar las dos hojas con seguridad. */
export function normalizarCedula(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/** Convierte un texto en número (admite coma decimal); vacío o inválido → 0. */
function aNumero(valor: unknown): number {
  const t = String(valor ?? "").trim();
  if (!t) return 0;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Localiza en el libro la hoja de períodos acumulados (tipo "VAC ANUAL …") por
 * sus columnas —Id. Empleado, Fecha Inicial, Fecha Final, Acumulado Días— sin
 * depender del nombre exacto de la hoja. Devuelve su nombre o null si no existe.
 */
export function detectarHojaAcumulados(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const fila = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0];
    if (!fila) continue;
    const headers = (fila as unknown[]).map((h) => normHeader(String(h ?? "")));
    const tieneId = headers.some((h) => h.includes("emplead") || h.includes("identificac"));
    const tieneIni = headers.some((h) => h.includes("fecha") && (h.includes("inicial") || h.includes("inicio")));
    const tieneFin = headers.some((h) => h.includes("fecha") && (h.includes("final") || h === "fecha fin"));
    const tieneAcum = headers.some((h) => h.includes("acumulado"));
    if (tieneId && tieneIni && tieneFin && tieneAcum) return name;
  }
  return null;
}

/**
 * Lee la hoja de acumulados (auto-detectada) y agrupa los períodos por cédula,
 * ordenados del más antiguo al más reciente (necesario para el consumo FIFO).
 * Devuelve un mapa vacío si el libro no trae esa hoja.
 */
export function extractAcumulados(wb: XLSX.WorkBook): AcumuladosMap {
  const map: AcumuladosMap = new Map();
  const sheetName = detectarHojaAcumulados(wb);
  if (!sheetName) return map;

  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  if (matrix.length === 0) return map;

  const headers = (matrix[0] as unknown[]).map((h) => normHeader(String(h ?? "")));
  const idx = (pred: (h: string) => boolean) => headers.findIndex(pred);
  const iId = idx((h) => h.includes("emplead") || h.includes("identificac"));
  const iIni = idx((h) => h.includes("fecha") && (h.includes("inicial") || h.includes("inicio")));
  const iFin = idx((h) => h.includes("fecha") && (h.includes("final") || h === "fecha fin"));
  const iAcum = idx((h) => h.includes("acumulado"));
  if (iId < 0 || iIni < 0 || iFin < 0 || iAcum < 0) return map;

  for (let r = 1; r < matrix.length; r++) {
    const arr = matrix[r] as unknown[];
    const cedula = normalizarCedula(arr[iId]);
    const inicio = arr[iIni];
    const fin = arr[iFin];
    if (!cedula || !(inicio instanceof Date) || !(fin instanceof Date)) continue;
    const periodo: Periodo = { inicio, fin, dias: aNumero(arr[iAcum]) };
    const lista = map.get(cedula);
    if (lista) lista.push(periodo);
    else map.set(cedula, [periodo]);
  }

  for (const lista of map.values()) {
    lista.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
  return map;
}

/**
 * Fecha de referencia para decidir qué períodos están causados: el último día
 * del mes/año elegido en el módulo para la carta. Un período se considera
 * causado si su fecha fin no supera esta fecha.
 */
export function fechaReferenciaCarta(mes: number, anio: number): Date {
  return new Date(anio, mes, 0);
}

/**
 * Arma el bloque de vacaciones a partir de una lista de períodos ya resuelta y
 * los días tomados/compensados. Es la pieza común a las tres fuentes (acumulados
 * del Excel, fallback de un período y captura manual): saldo = Σ días − toma −
 * compensados; la sección de compensados solo se activa si hay > 0.
 */
export function calcularBloqueVacaciones(
  periodos: { INICIO: string; FIN: string; DIAS: string }[],
  toma: number,
  compensados: number
): DatosVacaciones {
  const pool = periodos.reduce((s, p) => s + aNumero(p.DIAS), 0);
  return {
    PERIODOS: periodos,
    TOMA: String(toma),
    COMPENSADOS: String(compensados),
    SALDO_FINAL: String(pool - toma - compensados),
    HAY_COMPENSADOS: compensados > 0,
  };
}

/** Construye el bloque de un solo período a partir de los datos de la fila. */
function bloqueFallback(values: Record<string, string>): DatosVacaciones {
  return calcularBloqueVacaciones(
    [
      {
        INICIO: values["PERIODO 1"] ?? "",
        FIN: values["PERIODO 2"] ?? "",
        DIAS: values["DIAS_TIENE"] ?? "",
      },
    ],
    aNumero(values["DIAS_TOMA"]),
    aNumero(values["COMPENSADAS"])
  );
}

/** Bloque de vacaciones de una fila manual (períodos capturados a mano). */
export function bloqueManual(vac: VacacionesManual): DatosVacaciones {
  const periodos = vac.periodos.filter((p) => p.INICIO || p.FIN || p.DIAS);
  return calcularBloqueVacaciones(periodos, aNumero(vac.toma), aNumero(vac.compensados));
}

/**
 * Calcula el bloque de vacaciones de una fila combinando su solicitud
 * (DIAS_TOMA, COMPENSADAS) con los períodos acumulados de la cédula.
 *
 * - Solo se incluyen los períodos **causados** (fin ≤ `fechaRef`) con saldo > 0,
 *   ordenados del más antiguo al más reciente.
 * - El saldo final es la suma de los días causados menos lo tomado y compensado
 *   (el consumo FIFO arranca por el período más antiguo; el siguiente período se
 *   usa automáticamente cuando el anterior se agota).
 * - Si la cédula no está en la hoja de acumulados (o no tiene períodos causados)
 *   se mantiene el comportamiento actual: un único período desde PROGRAMACION.
 */
export function construirVacaciones(
  values: Record<string, string>,
  acumulados: AcumuladosMap,
  fechaRef: Date
): DatosVacaciones {
  const cedula = normalizarCedula(values["CEDULA"]);
  const periodos = (cedula && acumulados.get(cedula)) || [];
  const causados = periodos.filter((p) => p.fin.getTime() <= fechaRef.getTime() && p.dias > 0);

  if (causados.length === 0) return bloqueFallback(values);

  return calcularBloqueVacaciones(
    causados.map((p) => ({
      INICIO: formatearValor(p.inicio, true),
      FIN: formatearValor(p.fin, true),
      DIAS: String(p.dias),
    })),
    aNumero(values["DIAS_TOMA"]),
    aNumero(values["COMPENSADAS"])
  );
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
      tag === "." ? scope : scope ? scope[tag] : undefined,
  }),
  nullGetter: () => "",
};

/** Valores de render: texto plano más el bloque de vacaciones (array/booleanos). */
export type ValoresCarta = Record<string, unknown>;

/**
 * Devuelve los marcadores {ENTRE_LLAVES} presentes en la plantilla. Se quitan
 * los prefijos de sección/bucle (`#`, `/`, `^`) para que {#PERIODOS} y
 * {/PERIODOS} aparezcan una sola vez como "PERIODOS".
 */
export function extraerMarcadores(templateBuf: ArrayBuffer): string[] {
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, DOCX_OPTIONS);
  const texto = doc.getFullText();
  const set = new Set<string>();
  for (const match of texto.matchAll(/\{([^{}]+)\}/g)) {
    const tag = match[1].trim().replace(/^[#/^]/, "");
    if (tag) set.add(tag);
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
  values: ValoresCarta
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

export function cartaBlob(templateBuf: ArrayBuffer, values: ValoresCarta): Blob {
  const bytes = renderCarta(templateBuf, values);
  return new Blob([bytes as unknown as BlobPart], { type: MIME_DOCX });
}

/**
 * Genera un ZIP con una carta .docx por cada fila. `prepara` arma los valores de
 * render de cada fila (datos + {FECHACARTA} + bloque de vacaciones); así la
 * lógica de períodos vive en el módulo, que conoce los acumulados y la fecha.
 */
export async function generarZip(
  templateBuf: ArrayBuffer,
  rows: CartaRow[],
  prepara: (row: CartaRow) => ValoresCarta
): Promise<Blob> {
  const zip = new JSZip();
  const usados = new Map<string, number>();

  for (const row of rows) {
    let nombre = nombreCarta(row);
    const previo = usados.get(nombre) ?? 0;
    usados.set(nombre, previo + 1);
    if (previo > 0) nombre = `${nombre}_${previo + 1}`;
    zip.file(`${nombre}.docx`, renderCarta(templateBuf, prepara(row)));
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
  prepara: (row: CartaRow) => ValoresCarta,
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; filename: string }> {
  const { docxToPdf } = await import("./cartasPdfClient");

  if (rows.length === 1) {
    onProgress?.(0, 1);
    const blob = await docxToPdf(renderCarta(templateBuf, prepara(rows[0])));
    onProgress?.(1, 1);
    return { blob, filename: `${nombreCarta(rows[0])}.pdf` };
  }

  const zip = new JSZip();
  const usados = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i, rows.length);
    const pdf = await docxToPdf(renderCarta(templateBuf, prepara(rows[i])));
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
