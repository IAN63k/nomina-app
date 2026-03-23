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
     
    </div>
  );
}
