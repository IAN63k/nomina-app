"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FileType2,
  Files,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SheetData,
  cartaBlob,
  descargar,
  extractSheet,
  extraerMarcadores,
  fetchPlantillaDefecto,
  generarPdf,
  generarZip,
  listSheets,
  marcadoresSinColumna,
  nombreCarta,
  pickSheet,
  readWorkbook,
} from "@/src/services/cartasVacaciones";

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

  // Selección / filtros
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");

  // Estado UI
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
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

  const missing = useMemo(
    () => marcadoresSinColumna(markers, sheet.headers),
    [markers, sheet.headers]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sheet.rows.filter((r) => {
      if (onlyApproved && !aprobado(r)) return false;
      if (!q) return true;
      const hay = [
        v(r, "NOMBRE"),
        v(r, "APELLIDO"),
        v(r, "CARGO"),
        v(r, "C.T"),
        v(r, "CEDULA"),
        v(r, "SEDE"),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sheet.rows, search, onlyApproved]);

  const selectedRows = useMemo(
    () => sheet.rows.filter((r) => selected.has(r.index)),
    [sheet.rows, selected]
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
      if (fmt === "pdf") {
        const { blob, filename } = await generarPdf(templateBuf.current, rows);
        descargar(blob, filename);
      } else if (rows.length === 1) {
        descargar(cartaBlob(templateBuf.current, rows[0]), `${nombreCarta(rows[0])}.docx`);
      } else {
        const blob = await generarZip(templateBuf.current, rows);
        descargar(blob, `cartas_vacaciones_${activeSheet || "datos"}.zip`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      // Los fallos de PDF se muestran en un aviso dedicado con opción a Word.
      if (fmt === "pdf") setPdfError(msg);
      else setError(`Error al generar las cartas: ${msg}`);
    } finally {
      setGenerating(false);
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

  const hasData = sheet.rows.length > 0;

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
                    const falta = missing.includes(m);
                    return (
                      <span
                        key={m}
                        title={
                          falta
                            ? "Sin columna con el mismo nombre en el Excel"
                            : "Vinculado a una columna del Excel"
                        }
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
                          falta
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-primary/30 bg-primary/5 text-foreground"
                        )}
                      >
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

        {hasData && missing.length > 0 && (
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
          title="Base de datos (Excel)"
          subtitle="Cada fila de la hoja genera una carta. Los encabezados deben coincidir con los marcadores."
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
                {selectedRows.length} de {sheet.rows.length} seleccionada(s)
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
                onClick={handleGenerate}
                disabled={generating || selectedRows.length === 0}
                className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Generar {selectedRows.length > 1 ? `${selectedRows.length} cartas` : "carta"}
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
                  <TableHead>Área (C.T)</TableHead>
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
                        <div className="font-medium">
                          {`${v(row, "NOMBRE")} ${v(row, "APELLIDO")}`.trim() || "—"}
                        </div>
                        {v(row, "CEDULA") && (
                          <div className="text-xs text-muted-foreground">CC {v(row, "CEDULA")}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {v(row, "CARGO") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{v(row, "C.T") || "—"}</TableCell>
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
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Descargar esta carta"
                          onClick={() => handleSingle(row)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
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
        </section>
      )}
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
