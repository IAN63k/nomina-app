'use client';

import { Upload, X } from "lucide-react";
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
            id={`file-${label.replace(/\s/g, '-')}`}
          />
          <label
            htmlFor={`file-${label.replace(/\s/g, '-')}`}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <div className="flex items-center gap-2 w-full">
              <Upload className="h-4 w-4" />
              <span className="truncate">
                {selectedFile ? selectedFile.name : "Seleccionar archivo..."}
              </span>
            </div>
          </label>
        </div>
        {selectedFile && (
          <Button
            variant="outline"
            size="icon"
            onClick={onClear}
            disabled={disabled}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {selectedFile && (
        <p className="text-xs text-muted-foreground">
          Tamaño: {(selectedFile.size / 1024).toFixed(2)} KB
        </p>
      )}
    </div>
  );
}
