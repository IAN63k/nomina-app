import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import React from 'react';
import { ColumnDef } from '@tanstack/react-table';

export type ParsedData = Record<string, any>[];

export async function parseFile(file: File): Promise<ParsedData> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return parseCSV(file);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return parseExcel(file);
  } else {
    throw new Error('Formato de archivo no soportado');
  }
}

function parseCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data as ParsedData);
      },
      error: (error) => {
        reject(new Error(`Error al parsear CSV: ${error.message}`));
      },
    });
  });
}

async function parseExcel(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Obtener la primera hoja
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        resolve(jsonData as ParsedData);
      } catch (error) {
        reject(new Error(`Error al parsear Excel: ${(error as Error).message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };

    reader.readAsBinaryString(file);
  });
}

export function generateColumns(data: ParsedData): ColumnDef<Record<string, any>, unknown>[] {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  const columns: ColumnDef<Record<string, any>, unknown>[] = Object.keys(firstRow).map((key) => ({
    accessorKey: key,
    header: key,
    cell: ({ row }: any) => {
      const value = row.getValue(key);
    return React.createElement('div', { className: 'font-medium' }, String(value));
    },
  }));

  return columns;
}

export function exportToCSV(data: ParsedData, fileName: string) {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToExcel(data: ParsedData, fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
