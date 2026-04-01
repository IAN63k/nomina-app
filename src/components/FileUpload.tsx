import { useCallback, useState } from "react";
import { XLSX_MIME_TYPES } from "@/src/constants/shifts";

type FileUploadProps = {
  onFile: (file: File) => void;
  loading?: boolean;
  error?: string | null;
};

export function FileUpload({ onFile, loading = false, error }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  const handleFiles = useCallback(
    (files?: FileList | null) => {
      if (!files || !files.length) return;
      const file = files[0];
      setSelectedFileName(file.name);
      onFile(file);
    },
    [onFile]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={[
          "relative rounded-2xl border-2 border-dashed p-6 transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border bg-background",
        ].join(" ")}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Carga de horarios</span>
          <p className="text-lg font-semibold text-foreground">Arrastra tu archivo .xlsx</p>
          <p className="text-sm text-muted-foreground">También puedes hacer clic para seleccionar</p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
            <input
              type="file"
              accept={XLSX_MIME_TYPES.join(",")}
              className="hidden"
              onChange={onChange}
              disabled={loading}
            />
            {loading ? "Procesando..." : "Seleccionar archivo"}
          </label>

          {selectedFileName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Archivo seleccionado: <span className="font-medium text-foreground">{selectedFileName}</span>
            </p>
          ) : null}
        </div>
        {loading && <div className="absolute inset-0 rounded-2xl bg-background/60" aria-hidden />}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
