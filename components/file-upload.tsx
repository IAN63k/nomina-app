'use client';

import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  label: string;
  accept?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFileSelect,
  selectedFile,
  onClear,
  label,
  accept = ".xlsx,.xls,.csv",
  disabled = false,
}: FileUploadProps) {
  const inputId = `file-${label.replace(/\s/g, '-')}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const formattedSize = selectedFile
    ? selectedFile.size >= 1024 * 1024
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
      : `${(selectedFile.size / 1024).toFixed(2)} KB`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor={inputId}>
          {label}
        </label>
        <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv</span>
      </div>

      <div
        className={cn(
          "rounded-lg border bg-card p-3 transition-all duration-200 hover:shadow-sm",
          disabled && "opacity-70"
        )}
      >
        <div className="relative">
          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
            id={inputId}
          />

          <label
            htmlFor={inputId}
            className={cn(
              "flex min-h-20 w-full cursor-pointer items-center rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm ring-offset-background transition-all duration-200 hover:border-primary/40 hover:bg-accent/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              disabled && "cursor-not-allowed"
            )}
          >
            <div className="flex w-full items-center gap-3">
              <div className="rounded-md border bg-muted p-2 transition-colors duration-200">
                {selectedFile ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {selectedFile ? selectedFile.name : "Selecciona o arrastra un archivo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedFile
                    ? `Archivo listo para previsualizar${formattedSize ? ` • ${formattedSize}` : ""}`
                    : "Formatos permitidos: Excel y CSV"}
                </p>
              </div>
            </div>
          </label>
        </div>

        {selectedFile && (
          <div className="mt-3 flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={disabled}
              type="button"
              className="transition-all duration-200 hover:-translate-y-px"
            >
              <X className="mr-1 h-4 w-4" />
              Quitar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
