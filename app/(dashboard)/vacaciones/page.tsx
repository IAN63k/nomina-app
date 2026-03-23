'use client';

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  parseFile,
  generateColumns,
  ParsedData,
  exportToCSV,
  exportToExcel,
} from "@/lib/file-parser";
import {
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  Files,
  Download,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

type FileState = {
  file: File | null;
  data: ParsedData;
  columns: ColumnDef<Record<string, any>, unknown>[];
};

export default function VacacionesPage() {
  const [file1, setFile1] = useState<FileState>({
    file: null,
    data: [],
    columns: [],
  });
  const [file2, setFile2] = useState<FileState>({
    file: null,
    data: [],
    columns: [],
  });
  const [activeFile, setActiveFile] = useState<1 | 2 | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (fileNumber: 1 | 2, file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const parsedData = await parseFile(file);
      const columns = generateColumns(parsedData);

      if (fileNumber === 1) {
        setFile1({ file, data: parsedData, columns });
        setActiveFile(1);
      } else {
        setFile2({ file, data: parsedData, columns });
        setActiveFile(2);
      }
    } catch (err) {
      setError((err as Error).message);
      if (fileNumber === 1) {
        setFile1({ file: null, data: [], columns: [] });
      } else {
        setFile2({ file: null, data: [], columns: [] });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = (fileNumber: 1 | 2) => {
    if (fileNumber === 1) {
      setFile1({ file: null, data: [], columns: [] });
      if (activeFile === 1) {
        setActiveFile(file2.file ? 2 : null);
      }
    } else {
      setFile2({ file: null, data: [], columns: [] });
      if (activeFile === 2) {
        setActiveFile(file1.file ? 1 : null);
      }
    }
    setError(null);
  };

  const handleClearAll = () => {
    setFile1({ file: null, data: [], columns: [] });
    setFile2({ file: null, data: [], columns: [] });
    setActiveFile(null);
    setError(null);
  };

  const activeData = activeFile === 1 ? file1 : activeFile === 2 ? file2 : null;
  const loadedFilesCount = Number(Boolean(file1.file)) + Number(Boolean(file2.file));
  const totalRows = file1.data.length + file2.data.length;
  const activeFileName =
    activeFile === 1 ? file1.file?.name : activeFile === 2 ? file2.file?.name : null;
  const hasAnyFile = Boolean(file1.file || file2.file);

  const handleActiveDataChange = (updatedData: ParsedData) => {
    if (activeFile === 1) {
      setFile1((prev) => ({ ...prev, data: updatedData }));
    } else if (activeFile === 2) {
      setFile2((prev) => ({ ...prev, data: updatedData }));
    }
  };

  const getExportBaseName = () => {
    const originalName = activeData?.file?.name ?? "vacaciones";
    return originalName.replace(/\.[^/.]+$/, "") + "-editado";
  };

  const handleExportCSV = () => {
    if (!activeData?.data.length) return;
    exportToCSV(activeData.data, getExportBaseName());
  };

  const handleExportExcel = () => {
    if (!activeData?.data.length) return;
    exportToExcel(activeData.data, getExportBaseName());
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Módulo de vacaciones
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Vacaciones</h1>
            <p className="mt-2 text-muted-foreground">
              Carga, valida y previsualiza archivos Excel o CSV antes de continuar con el
              procesamiento.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:min-w-95">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Archivos cargados</p>
              <p className="mt-1 text-xl font-semibold">{loadedFilesCount}/2</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Registros totales</p>
              <p className="mt-1 text-xl font-semibold">{totalRows}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Estado</p>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                {loadedFilesCount > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Listo para revisar
                  </>
                ) : (
                  <>
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    Pendiente de carga
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Carga de archivos</h2>
            <p className="text-sm text-muted-foreground">
              Puedes trabajar con uno o dos archivos y alternar su previsualización.
            </p>
          </div>
          {hasAnyFile && (
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={isLoading}
              className="w-full transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0 md:w-auto"
            >
              Limpiar todo
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-background p-4 transition-colors duration-200 hover:bg-accent/20">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Archivo 1</p>
              {file1.file && (
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Cargado
                </span>
              )}
            </div>
            <FileUpload
              label="Seleccionar archivo 1"
              selectedFile={file1.file}
              onFileSelect={(file) => handleFileSelect(1, file)}
              onClear={() => handleClear(1)}
              disabled={isLoading}
            />
          </div>

          <div className="rounded-lg border bg-background p-4 transition-colors duration-200 hover:bg-accent/20">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Archivo 2</p>
              {file2.file && (
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Cargado
                </span>
              )}
            </div>
            <FileUpload
              label="Seleccionar archivo 2"
              selectedFile={file2.file}
              onFileSelect={(file) => handleFileSelect(2, file)}
              onClear={() => handleClear(2)}
              disabled={isLoading}
            />
          </div>
        </div>

        {hasAnyFile && (
          <div className="mt-5 flex flex-wrap gap-2">
            {file1.file && (
              <Button
                variant={activeFile === 1 ? "default" : "outline"}
                onClick={() => setActiveFile(1)}
                disabled={isLoading}
                className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver archivo 1
              </Button>
            )}
            {file2.file && (
              <Button
                variant={activeFile === 2 ? "default" : "outline"}
                onClick={() => setActiveFile(2)}
                disabled={isLoading}
                className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver archivo 2
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed bg-muted/40 py-8">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Procesando archivo...</p>
            </div>
          </div>
        )}
      </section>

      {activeData && activeData.data.length > 0 && !isLoading && (
        <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Previsualización activa
              </p>
              <h2 className="text-lg font-semibold">{activeFileName}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Files className="h-4 w-4" />
                {activeData.data.length} registro(s)
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="transition-all duration-200 hover:-translate-y-px"
              >
                <Download className="mr-2 h-4 w-4" />
                Guardar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="transition-all duration-200 hover:-translate-y-px"
              >
                <Download className="mr-2 h-4 w-4" />
                Guardar Excel
              </Button>
            </div>
          </div>
          <DataTable
            columns={activeData.columns}
            data={activeData.data}
            onDataChange={handleActiveDataChange}
          />
        </section>
      )}

      {!activeFile && !isLoading && (
        <section className="rounded-xl border border-dashed bg-muted/30 p-12 text-center">
          <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No hay previsualización activa</h3>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Carga al menos un archivo y pulsa “Ver archivo” para revisar los datos antes
            de procesarlos.
          </p>
        </section>
      )}

      {!isLoading && hasAnyFile && !activeData?.data.length && (
        <section className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
          <Clock3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-semibold">Sin registros para mostrar</h3>
          <p className="text-sm text-muted-foreground">
            El archivo cargado no contiene filas válidas o aún no ha sido seleccionado para
            previsualización.
          </p>
        </section>
      )}
    </div>
  );
}
