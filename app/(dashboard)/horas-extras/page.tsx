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

export default function HorasExtras() {
 
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
     <section className="rounded-xl border bg-card p-6 transition-shadow duration-200 hover:shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Módulo de Horas Extras
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Horas Extras</h1>
            <p className="mt-2 text-muted-foreground">
              En construcción. Pronto podrás cargar tus archivos de horas extras, visualizarlos y exportarlos en diferentes formatos.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
