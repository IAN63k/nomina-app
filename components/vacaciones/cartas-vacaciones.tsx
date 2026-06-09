"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FileType2,
  Files,
  ListChecks,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  CartaRow,
  MARCADOR_FECHA,
  MESES_ES,
  SheetData,
  cartaBlob,
  descargar,
  extractSheet,
  extraerMarcadores,
  fechaCartaTexto,
  fetchPlantillaDefecto,
  generarPdf,
  generarZip,
  listSheets,
  marcadoresSinColumna,
  nombreCarta,
  pickSheet,
  readWorkbook,
  renderCarta,
} from "@/src/services/cartasVacaciones";
import { renderDocxInIframe } from "@/src/services/cartasPdfClient";

const EMPTY_SHEET: SheetData = { headers: [], rows: [] };

// Encabezado normalizado que marca una fila como aprobada.
const ESTADO_HEADER = "ESTADO DE APROBACION";

function aprobado(row: CartaRow): boolean {
  const estado = (row.values[ESTADO_HEADER] ?? "").trim().toUpperCase();
  return estado === "APROBADO";
}

function v(row: CartaRow, header: string): string {
  return row.values[header] ?? "";
}

export function CartasVacaciones() {
  // Plantilla
  const templateBuf = useRef<ArrayBuffer | null>(null);
  const [templateName, setTemplateName] = useState("carta_vacaciones.docx");
  const [templateDefault, setTemplateDefault] = useState(true);
  const [markers, setMarkers] = useState<string[]>([]);
  const [templateLoading, setTemplateLoading] = useState(true);

  // Datos (Excel)
  const workbook = useRef<WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [sheet, setSheet] = useState<SheetData>(EMPTY_SHEET);
  const [excelName, setExcelName] = useState<string | null>(null);

  // Personas agregadas manualmente (sin Excel). Usan índices negativos para no
  // colisionar con las filas del Excel (que empiezan en 1).
  const [manualRows, setManualRows] = useState<CartaRow[]>([]);
  const manualSeq = useRef(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formRow, setFormRow] = useState<CartaRow | null>(null);

  // Fecha de la carta ({FECHACARTA}). La ajusta el usuario desde el módulo; no
  // viene del Excel ni del formulario. Pre-seleccionada al mes/año actuales.
  const [mesCarta, setMesCarta] = useState(() => new Date().getMonth() + 1);
  const [anioCarta, setAnioCarta] = useState(() => new Date().getFullYear());

  // Previsualización: docx ya renderizado a bytes + título del panel. El seq
  // remonta el visor en cada apertura para arrancar limpio sin efectos.
  const [previewDocx, setPreviewDocx] = useState<Uint8Array | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewSeq, setPreviewSeq] = useState(0);

  // Selección / filtros
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");

  // Estado UI
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const lastAttempt = useRef<CartaRow[]>([]);

  // Cargar la plantilla incluida al montar.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const buf = await fetchPlantillaDefecto();
        if (cancel) return;
        templateBuf.current = buf;
        setMarkers(extraerMarcadores(buf));
      } catch (err) {
        if (!cancel) setError((err as Error).message);
      } finally {
        if (!cancel) setTemplateLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const loadSheet = (wb: WorkBook, name: string) => {
    const data = extractSheet(wb, name);
    setActiveSheet(name);
    setSheet(data);
    // Selección inicial: todas las filas.
    setSelected(new Set(data.rows.map((r) => r.index)));
  };

  const handleExcel = async (file: File) => {
    setError(null);
    try {
      const wb = readWorkbook(await file.arrayBuffer());
      workbook.current = wb;
      const names = listSheets(wb);
      setSheetNames(names);
      setExcelName(file.name);
      loadSheet(wb, pickSheet(wb));
    } catch (err) {
      setError(`No se pudo leer el Excel: ${(err as Error).message}`);
    }
  };

  const handleSheetChange = (name: string) => {
    if (!workbook.current) return;
    loadSheet(workbook.current, name);
  };

  const handleCustomTemplate = async (file: File) => {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const found = extraerMarcadores(buf);
      templateBuf.current = buf;
      setMarkers(found);
      setTemplateName(file.name);
      setTemplateDefault(false);
    } catch {
      setError("El archivo no es una plantilla .docx válida.");
    }
  };

  // Abre el formulario para una persona nueva o para editar una existente.
  const openNewPersona = () => {
    setFormRow(null);
    setFormOpen(true);
  };
  const openEditPersona = (row: CartaRow) => {
    setFormRow(row);
    setFormOpen(true);
  };

  // Guarda los datos del formulario como una fila manual (alta o edición).
  const savePersona = (values: Record<string, string>) => {
    if (formRow) {
      setManualRows((prev) =>
        prev.map((r) =>
          r.index === formRow.index ? { ...r, raw: { ...values }, values } : r
        )
      );
    } else {
      manualSeq.current -= 1;
      const index = manualSeq.current;
      setManualRows((prev) => [...prev, { index, raw: { ...values }, values }]);
      setSelected((prev) => new Set(prev).add(index));
    }
    setFormOpen(false);
    setFormRow(null);
  };

  const removePersona = (index: number) => {
    setManualRows((prev) => prev.filter((r) => r.index !== index));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  // ¿La plantilla usa {FECHACARTA}? Solo entonces mostramos el selector de fecha.
  const usaFecha = markers.includes(MARCADOR_FECHA);
  const fechaCartaStr = fechaCartaTexto(mesCarta, anioCarta);

  // Inyecta {FECHACARTA} (valor del módulo) en cada fila antes de generar.
  const conFecha = (rows: CartaRow[]): CartaRow[] =>
    rows.map((r) => ({
      ...r,
      values: { ...r.values, [MARCADOR_FECHA]: fechaCartaStr },
    }));

  // {FECHACARTA} no es un campo del Excel ni del formulario: se excluye de ambos.
  const marcadoresDatos = useMemo(
    () => markers.filter((m) => m !== MARCADOR_FECHA),
    [markers]
  );

  const missing = useMemo(
    () => marcadoresSinColumna(marcadoresDatos, sheet.headers),
    [marcadoresDatos, sheet.headers]
  );

  // Previsualización de una carta concreta (con sus datos + la fecha del módulo).
  const previewRow = (row: CartaRow) => {
    if (!templateBuf.current) return;
    setPreviewTitle(
      `${v(row, "NOMBRE")} ${v(row, "APELLIDO")}`.trim() || `Fila ${row.index}`
    );
    setPreviewDocx(
      renderCarta(templateBuf.current, {
        ...row.values,
        [MARCADOR_FECHA]: fechaCartaStr,
      })
    );
    setPreviewSeq((s) => s + 1);
  };

  // Previsualización de la plantilla en blanco: los marcadores quedan visibles
  // ({NOMBRE}, {CARGO}…) y solo se aplica el mes elegido.
  const previewPlantilla = () => {
    if (!templateBuf.current) return;
    const vals: Record<string, string> = {};
    for (const m of markers) vals[m] = m === MARCADOR_FECHA ? fechaCartaStr : `{${m}}`;
    setPreviewTitle("Plantilla");
    setPreviewDocx(renderCarta(templateBuf.current, vals));
    setPreviewSeq((s) => s + 1);
  };

  // Filas del Excel + personas agregadas manualmente.
  const allRows = useMemo(
    () => [...sheet.rows, ...manualRows],
    [sheet.rows, manualRows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (onlyApproved && !aprobado(r)) return false;
      if (!q) return true;
      const hay = [
        v(r, "NOMBRE"),
        v(r, "APELLIDO"),
        v(r, "CARGO"),
        v(r, "CEDULA"),
        v(r, "SEDE"),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, search, onlyApproved]);

  const selectedRows = useMemo(
    () => allRows.filter((r) => selected.has(r.index)),
    [allRows, selected]
  );

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.index));

  const toggleRow = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRows.forEach((r) => next.delete(r.index));
      } else {
        filteredRows.forEach((r) => next.add(r.index));
      }
      return next;
    });
  };

  const generate = async (rows: CartaRow[], fmt: "docx" | "pdf") => {
    if (!templateBuf.current || rows.length === 0) return;
    lastAttempt.current = rows;
    setGenerating(true);
    setError(null);
    setPdfError(null);
    try {
      // {FECHACARTA} se inyecta aquí: lo controla el módulo, no los datos base.
      const filas = conFecha(rows);
      if (fmt === "pdf") {
        setPdfProgress({ done: 0, total: filas.length });
        const { blob, filename } = await generarPdf(templateBuf.current, filas, (done, total) =>
          setPdfProgress({ done, total })
        );
        descargar(blob, filename);
      } else if (filas.length === 1) {
        descargar(cartaBlob(templateBuf.current, filas[0]), `${nombreCarta(filas[0])}.docx`);
      } else {
        const blob = await generarZip(templateBuf.current, filas);
        descargar(blob, `cartas_vacaciones_${activeSheet || "datos"}.zip`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      // Los fallos de PDF se muestran en un aviso dedicado con opción a Word.
      if (fmt === "pdf") setPdfError(msg);
      else setError(`Error al generar las cartas: ${msg}`);
    } finally {
      setGenerating(false);
      setPdfProgress(null);
    }
  };

  const handleGenerate = () => generate(selectedRows, format);
  const handleSingle = (row: CartaRow) => generate([row], format);

  const handleFallbackWord = () => {
    setFormat("docx");
    generate(lastAttempt.current.length ? lastAttempt.current : selectedRows, "docx");
  };

  const changeFormat = (fmt: "docx" | "pdf") => {
    setFormat(fmt);
    setPdfError(null);
  };

  const hasExcel = sheet.rows.length > 0;
  const hasData = allRows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive animate-in fade-in slide-in-from-top-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Paso 1 — Plantilla */}
      <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <StepHeader
          step={1}
          icon={<FileText className="h-4 w-4" />}
          title="Plantilla de la carta"
          subtitle="La carta de Word con los marcadores entre llaves. Usa la incluida o sube la tuya."
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border bg-muted p-2">
                {templateLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck2 className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{templateName}</p>
                <p className="text-xs text-muted-foreground">
                  {templateDefault ? "Plantilla incluida en el proyecto" : "Plantilla personalizada"}
                  {markers.length > 0 && ` • ${markers.length} marcadores`}
                </p>
              </div>
            </div>

            {markers.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Marcadores detectados</p>
                <div className="flex flex-wrap gap-1.5">
                  {markers.map((m) => {
                    const esFecha = m === MARCADOR_FECHA;
                    const falta = !esFecha && missing.includes(m);
                    return (
                      <span
                        key={m}
                        title={
                          esFecha
                            ? "Se ajusta desde el módulo (no viene del Excel)"
                            : falta
                              ? "Sin columna con el mismo nombre en el Excel"
                              : "Vinculado a una columna del Excel"
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
                          esFecha
                            ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                            : falta
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "border-primary/30 bg-primary/5 text-foreground"
                        )}
                      >
                        {esFecha && <CalendarDays className="h-3 w-3" />}
                        {`{${m}}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs transition-all duration-200 hover:-translate-y-px hover:bg-accent">
            <Upload className="h-4 w-4" />
            Usar otra plantilla
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCustomTemplate(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {usaFecha && (
          <div className="mt-4 rounded-lg border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-md border bg-muted p-2 text-sky-600">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fecha de la carta</p>
                  <p className="text-xs text-muted-foreground">
                    Se inserta en{" "}
                    <span className="font-mono">{`{FECHACARTA}`}</span>. La eliges aquí;
                    no viene del Excel ni del formulario.
                  </p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Mes</span>
                  <select
                    value={mesCarta}
                    onChange={(e) => setMesCarta(Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {MESES_ES.slice(1).map((nombre, i) => (
                      <option key={nombre} value={i + 1} className="capitalize">
                        {nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Año</span>
                  <select
                    value={anioCarta}
                    onChange={(e) => setAnioCarta(Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Encabezado:{" "}
              <span className="font-medium text-foreground">
                Santiago de Cali, {fechaCartaStr}
              </span>
            </p>
          </div>
        )}

        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={previewPlantilla}
            disabled={markers.length === 0}
          >
            <Eye className="h-4 w-4" />
            Ver plantilla
          </Button>
        </div>

        {hasExcel && missing.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">
              {missing.length === 1 ? "El marcador" : "Los marcadores"}{" "}
              <span className="font-mono font-medium">
                {missing.map((m) => `{${m}}`).join(", ")}
              </span>{" "}
              no {missing.length === 1 ? "tiene" : "tienen"} una columna con el mismo nombre en la
              hoja y quedarán en blanco.
            </p>
          </div>
        )}
      </section>

      {/* Paso 2 — Datos */}
      <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <StepHeader
          step={2}
          icon={<Files className="h-4 w-4" />}
          title="Datos de los empleados"
          subtitle="Carga un Excel (cada fila es una carta) o agrega una persona a mano y completa sus datos."
        />

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-background px-4 py-3 text-sm transition-all duration-200 hover:border-primary/40 hover:bg-accent/40">
            <div className="rounded-md border bg-muted p-2">
              {excelName ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {excelName ?? "Selecciona un archivo Excel"}
              </p>
              <p className="text-xs text-muted-foreground">
                {excelName
                  ? `${sheet.rows.length} fila(s) con datos en “${activeSheet}”`
                  : "Formatos .xlsx o .xls"}
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleExcel(f);
                e.target.value = "";
              }}
            />
          </label>

          {sheetNames.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Hoja</span>
              <select
                value={activeSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            o
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            ¿Solo necesitas una carta? Agrega la persona y completa sus datos en un
            formulario.
          </p>
          <Button
            variant="outline"
            onClick={openNewPersona}
            disabled={markers.length === 0}
            title={
              markers.length === 0
                ? "Esperando los marcadores de la plantilla…"
                : "Agregar una persona manualmente"
            }
            className="shrink-0 transition-all duration-200 hover:-translate-y-px"
          >
            <UserPlus className="h-4 w-4" />
            Agregar persona
          </Button>
        </div>
      </section>

      {/* Paso 3 — Cartas */}
      {hasData ? (
        <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <StepHeader
            step={3}
            icon={<ListChecks className="h-4 w-4" />}
            title="Revisa y genera las cartas"
            subtitle="Selecciona las personas a las que quieres generar la carta de vacaciones."
          />

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, cargo, cédula…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyApproved((p) => !p)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  onlyApproved
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                Solo aprobados
              </button>
              <span className="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                {selectedRows.length} de {allRows.length} seleccionada(s)
              </span>

              <div className="inline-flex items-center rounded-md border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => changeFormat("docx")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors",
                    format === "docx"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="h-4 w-4" />
                  Word
                </button>
                <button
                  type="button"
                  onClick={() => changeFormat("pdf")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors",
                    format === "pdf"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileType2 className="h-4 w-4" />
                  PDF
                </button>
              </div>

              <Button
                variant="outline"
                onClick={() => previewRow(selectedRows[0] ?? filteredRows[0])}
                disabled={selectedRows.length === 0 && filteredRows.length === 0}
                title="Previsualizar la primera carta seleccionada"
              >
                <Eye className="h-4 w-4" />
                Vista previa
              </Button>

              <Button
                onClick={handleGenerate}
                disabled={generating || selectedRows.length === 0}
                className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {generating && pdfProgress && pdfProgress.total > 1
                  ? `Generando PDF ${pdfProgress.done}/${pdfProgress.total}`
                  : `Generar ${selectedRows.length > 1 ? `${selectedRows.length} cartas` : "carta"}`}
              </Button>
            </div>
          </div>

          {pdfError && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive animate-in fade-in slide-in-from-top-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">No se pudo generar el PDF</p>
                  <p className="mt-0.5 text-sm text-destructive/90">{pdfError}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFallbackWord}
                  disabled={generating}
                  className="border-destructive/40 bg-background text-foreground hover:bg-accent"
                >
                  <FileText className="h-4 w-4" />
                  Descargar en Word
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cerrar aviso"
                  onClick={() => setPdfError(null)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todo"
                      className="size-4 cursor-pointer accent-[var(--primary)]"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                    />
                  </TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-center">Días</TableHead>
                  <TableHead>Vacaciones</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Carta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const checked = selected.has(row.index);
                  const ok = aprobado(row);
                  const esManual = row.index < 0;
                  return (
                    <TableRow
                      key={row.index}
                      data-state={checked ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => toggleRow(row.index)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-[var(--primary)]"
                          checked={checked}
                          onChange={() => toggleRow(row.index)}
                          aria-label={`Seleccionar ${v(row, "NOMBRE")}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {`${v(row, "NOMBRE")} ${v(row, "APELLIDO")}`.trim() || "—"}
                          </span>
                          {esManual && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Manual
                            </span>
                          )}
                        </div>
                        {v(row, "CEDULA") && (
                          <div className="text-xs text-muted-foreground">CC {v(row, "CEDULA")}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {v(row, "CARGO") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{v(row, "SEDE") || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {v(row, "PERIODO 1") || v(row, "PERIODO 2")
                          ? `${v(row, "PERIODO 1")} – ${v(row, "PERIODO 2")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {v(row, "DIAS_TOMA") || v(row, "DIAS_TIENE") || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {v(row, "SALIDA") ? (
                          <>
                            {v(row, "SALIDA")} → {v(row, "HASTA")}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {v(row, ESTADO_HEADER) ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              ok
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {v(row, ESTADO_HEADER)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Vista previa"
                            onClick={() => previewRow(row)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {esManual && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Editar datos"
                                onClick={() => openEditPersona(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Eliminar persona"
                                onClick={() => removePersona(row.index)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Descargar esta carta"
                            onClick={() => handleSingle(row)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No hay filas que coincidan con el filtro.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed bg-muted/30 p-12 text-center animate-in fade-in">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">Genera cartas de vacaciones en segundos</h3>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Carga el Excel con la programación de vacaciones y combina cada fila con la plantilla
            para descargar las cartas en Word, individuales o en un único ZIP.
          </p>
          <Button
            variant="outline"
            onClick={openNewPersona}
            disabled={markers.length === 0}
            className="mx-auto mt-6"
          >
            <UserPlus className="h-4 w-4" />
            Agregar una persona manualmente
          </Button>
        </section>
      )}

      <PersonaForm
        open={formOpen}
        markers={marcadoresDatos}
        row={formRow}
        onSave={savePersona}
        onClose={() => {
          setFormOpen(false);
          setFormRow(null);
        }}
      />

      <CartaPreview
        docx={previewDocx}
        seq={previewSeq}
        title={previewTitle}
        onClose={() => setPreviewDocx(null)}
      />
    </div>
  );
}

// Campo de ayuda del formulario individual: saldo de días = DIAS_TIENE −
// DIAS_TOMA. No es un marcador de la plantilla (a menos que se agregue allí);
// se precalcula y queda editable para poder ajustarlo a mano.
const CAMPO_SALDO = "SALDO";

/**
 * Calcula el saldo de días como DIAS_TIENE − DIAS_TOMA. Devuelve "" si ninguno
 * tiene valor o si alguno no es numérico; una celda vacía cuenta como 0.
 */
function calcularSaldo(tiene: string, toma: string): string {
  const t = (tiene ?? "").trim();
  const m = (toma ?? "").trim();
  if (!t && !m) return "";
  const nt = t === "" ? 0 : Number(t.replace(",", "."));
  const nm = m === "" ? 0 : Number(m.replace(",", "."));
  if (!Number.isFinite(nt) || !Number.isFinite(nm)) return "";
  return String(nt - nm);
}

// Marcadores que conviene mostrar primero en el formulario; el resto va detrás
// en el orden de la plantilla.
const ORDEN_CAMPOS = [
  "NOMBRE",
  "APELLIDO",
  "CEDULA",
  "CARGO",
  "SEDE",
  "PERIODO 1",
  "PERIODO 2",
  "SALIDA",
  "HASTA",
  "DIAS_TOMA",
  "DIAS_TIENE",
  CAMPO_SALDO,
];

function ordenarCampos(markers: string[]): string[] {
  return [...markers].sort((a, b) => {
    const ia = ORDEN_CAMPOS.indexOf(a);
    const ib = ORDEN_CAMPOS.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Formulario lateral para registrar (o editar) una persona a mano. Los campos
 * se derivan de los marcadores de la plantilla, así la carta queda completa.
 */
function PersonaForm({
  open,
  markers,
  row,
  onSave,
  onClose,
}: {
  open: boolean;
  markers: string[];
  row: CartaRow | null;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{row ? "Editar persona" : "Agregar persona"}</SheetTitle>
          <SheetDescription>
            Completa los datos de la carta. Cada campo corresponde a un marcador de
            la plantilla; los que dejes en blanco saldrán vacíos.
          </SheetDescription>
        </SheetHeader>

        {/* El cuerpo se remonta en cada apertura (key) para arrancar con los
            datos de la fila en edición o en blanco, sin efectos. */}
        {open && (
          <PersonaFormBody
            key={row ? row.index : "nueva"}
            markers={markers}
            row={row}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PersonaFormBody({
  markers,
  row,
  onSave,
  onClose,
}: {
  markers: string[];
  row: CartaRow | null;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  // El saldo es un campo extra del formulario; si la plantilla ya lo trae como
  // marcador, se respeta su posición y no se duplica.
  const campos = useMemo(
    () => ordenarCampos(markers.includes(CAMPO_SALDO) ? markers : [...markers, CAMPO_SALDO]),
    [markers]
  );

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of markers) init[m] = row?.values[m] ?? "";
    // Saldo: usa el guardado o lo calcula a partir de los días.
    init[CAMPO_SALDO] =
      row?.values[CAMPO_SALDO] ?? calcularSaldo(init["DIAS_TIENE"] ?? "", init["DIAS_TOMA"] ?? "");
    return init;
  });

  // Mientras el usuario no edite el saldo a mano, se mantiene sincronizado con
  // DIAS_TIENE − DIAS_TOMA. Al editarlo, deja de recalcularse solo.
  const [saldoManual, setSaldoManual] = useState(() =>
    Boolean((row?.values[CAMPO_SALDO] ?? "").trim())
  );

  const setField = (campo: string, valor: string) =>
    setValues((prev) => {
      const next = { ...prev, [campo]: valor };
      if (!saldoManual && (campo === "DIAS_TIENE" || campo === "DIAS_TOMA")) {
        next[CAMPO_SALDO] = calcularSaldo(next["DIAS_TIENE"] ?? "", next["DIAS_TOMA"] ?? "");
      }
      return next;
    });

  const setSaldo = (valor: string) => {
    setSaldoManual(true);
    setValues((prev) => ({ ...prev, [CAMPO_SALDO]: valor }));
  };

  const algunDato = Object.values(values).some((v) => v.trim() !== "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!algunDato) return;
    // Normaliza: recorta espacios en cada campo.
    const limpio: Record<string, string> = {};
    for (const campo of campos) limpio[campo] = (values[campo] ?? "").trim();
    onSave(limpio);
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {campos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            La plantilla no tiene marcadores, no hay campos para completar.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {campos.map((campo) => {
              const esSaldo = campo === CAMPO_SALDO;
              return (
                <div key={campo} className="flex flex-col gap-1.5">
                  <Label htmlFor={`campo-${campo}`} className="font-mono text-xs">
                    {campo}
                  </Label>
                  <Input
                    id={`campo-${campo}`}
                    value={values[campo] ?? ""}
                    onChange={(e) =>
                      esSaldo ? setSaldo(e.target.value) : setField(campo, e.target.value)
                    }
                    inputMode={esSaldo ? "numeric" : undefined}
                    autoComplete="off"
                  />
                  {esSaldo && (
                    <p className="text-xs text-muted-foreground">
                      Calculado como DIAS_TIENE − DIAS_TOMA. Puedes ajustarlo.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!algunDato}>
          {row ? "Guardar cambios" : "Agregar"}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Panel lateral que previsualiza una carta ya renderizada (docx → iframe vía
 * docx-preview). El render es un efecto sobre un sistema externo (el iframe).
 */
function CartaPreview({
  docx,
  seq,
  title,
  onClose,
}: {
  docx: Uint8Array | null;
  seq: number;
  title: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={docx !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate pr-8">
            Vista previa{title ? ` — ${title}` : ""}
          </SheetTitle>
          <SheetDescription>
            Así se verá la carta al generarla. Es solo una previsualización.
          </SheetDescription>
        </SheetHeader>

        {/* key=seq → se remonta en cada apertura y arranca con loading=true sin
            necesidad de setState dentro del efecto. */}
        {docx && <CartaPreviewBody key={seq} docx={docx} />}
      </SheetContent>
    </Sheet>
  );
}

function CartaPreviewBody({ docx }: { docx: Uint8Array }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    let cancel = false;
    renderDocxInIframe(docx, iframeRef.current)
      .then(() => !cancel && setLoading(false))
      .catch((err) => {
        if (cancel) return;
        setError((err as Error).message);
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [docx]);

  return (
    <div className="relative min-h-0 flex-1 bg-muted">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/80 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generando vista previa…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Vista previa de la carta"
        className="h-full w-full border-0"
      />
    </div>
  );
}

function StepHeader({
  step,
  icon,
  title,
  subtitle,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
        {step}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-lg font-semibold leading-none">{title}</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
