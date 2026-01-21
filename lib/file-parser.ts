import * as XLSX from 'xlsx';
import Papa from 'papaparse';

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

export function generateColumns(data: ParsedData) {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  const columns = Object.keys(firstRow).map((key) => ({
    accessorKey: key,
    header: key,
    cell: ({ row }: any) => {
      const value = row.getValue(key);
      return <div className="font-medium">{String(value)}</div>;
    },
  }));

  return columns;
}
