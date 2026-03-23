'use client';

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

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

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onDataChange?: (data: TData[]) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onDataChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [editableData, setEditableData] = React.useState<TData[]>(data);

  React.useEffect(() => {
    setEditableData(data);
  }, [data]);

  const updateCellValue = React.useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      setEditableData((prev) =>
        {
          const next = prev.map((row, index) => {
          if (index !== rowIndex) return row;

          return {
            ...(row as Record<string, unknown>),
            [columnId]: value,
          } as TData;
          });

          onDataChange?.(next);
          return next;
        }
      );
    },
    [onDataChange]
  );

  const table = useReactTable({
    data: editableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  const filteredRows = table.getFilteredRowModel().rows.length;
  const totalRows = editableData.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar en todas las columnas..."
            value={globalFilter ?? ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-9 pr-9 transition-all duration-200 focus-visible:ring-2"
          />
          {globalFilter && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setGlobalFilter("")}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md border bg-background px-2.5 py-1 text-muted-foreground">
            {filteredRows} visibles
          </span>
          <span className="rounded-md border bg-background px-2.5 py-1 text-muted-foreground">
            {totalRows} totales
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-2">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 transition-colors hover:bg-muted"
                              onClick={() => header.column.toggleSorting()}
                            >
                              <ArrowUpDown className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="transition-colors hover:bg-muted/40"
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <Input
                        value={String(cell.getValue() ?? "")}
                        onChange={(event) =>
                          updateCellValue(row.index, cell.column.id, event.target.value)
                        }
                        className="h-8 min-w-28 border-transparent bg-transparent px-2 shadow-none transition-colors focus-visible:border-input focus-visible:bg-background"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-28 text-center text-muted-foreground"
                >
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          Página {table.getState().pagination.pageIndex + 1} de{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="transition-all duration-200 hover:-translate-y-px disabled:hover:translate-y-0"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
