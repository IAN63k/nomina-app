'use client';

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { parseFile, generateColumns, ParsedData } from "@/lib/file-parser";
import { FileSpreadsheet, AlertCircle } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

type FileState = {
  file: File | null;
  data: ParsedData;
  columns: ColumnDef<any>[];
};

export default function CartasVacacionesPage() {
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

  const activeData = activeFile === 1 ? file1 : activeFile === 2 ? file2 : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Header */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <FileSpreadsheet className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Cartas de Vacaciones</h1>
        </div>
        <p className="text-muted-foreground">
          Carga archivos Excel o CSV para previsualizarlos y procesarlos.
        </p>
      </div>

      {/* File Upload Section */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Cargar Archivos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FileUpload
            label="Archivo 1"
            selectedFile={file1.file}
            onFileSelect={(file) => handleFileSelect(1, file)}
            onClear={() => handleClear(1)}
            disabled={isLoading}
          />
          <FileUpload
            label="Archivo 2"
            selectedFile={file2.file}
            onFileSelect={(file) => handleFileSelect(2, file)}
            onClear={() => handleClear(2)}
            disabled={isLoading}
          />
        </div>

        {/* File Selection Buttons */}
        {(file1.file || file2.file) && (
          <div className="mt-4 flex gap-2">
            {file1.file && (
              <Button
                variant={activeFile === 1 ? "default" : "outline"}
                onClick={() => setActiveFile(1)}
                disabled={isLoading}
              >
                Ver Archivo 1
              </Button>
            )}
            {file2.file && (
              <Button
                variant={activeFile === 2 ? "default" : "outline"}
                onClick={() => setActiveFile(2)}
                disabled={isLoading}
              >
                Ver Archivo 2
              </Button>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="mt-4 flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Procesando archivo...</p>
            </div>
          </div>
        )}
      </div>

      {/* Data Table Section */}
      {activeData && activeData.data.length > 0 && !isLoading && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Previsualización: {activeData.file?.name}
            </h2>
            <div className="text-sm text-muted-foreground">
              {activeData.data.length} registro(s)
            </div>
          </div>
          <DataTable columns={activeData.columns} data={activeData.data} />
        </div>
      )}

      {/* Empty State */}
      {!activeFile && !isLoading && (
        <div className="rounded-lg border bg-muted/50 p-12 text-center">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No hay archivos cargados</h3>
          <p className="text-muted-foreground">
            Selecciona uno o más archivos Excel o CSV para comenzar.
          </p>
        </div>
      )}
    </div>
  );
}
