# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
npm start        # Start production server
```

No test framework is configured yet.

## Architecture

**Nomina-app** is a payroll/HR management system focused on medical shift scheduling, overtime calculation, and employee scheduling for healthcare staff.

### Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript strict mode)
- **Tailwind CSS 4** + **Radix UI** primitives + Shadcn-style components
- **Supabase** (PostgreSQL) for persistence
- **XLSX / PapaParse** for Excel/CSV file import

### Directory Layout

Two component areas coexist due to ongoing migration:
- `/components/` — UI primitives (`ui/`) and layout components (sidebars, nav)
- `/src/components/` — Feature-specific components (FileUpload, ScheduleTable, etc.)
- `/src/services/` — DB queries and data transformation (`turnosMedicosDb.ts`, `excelParser.ts`)
- `/src/types/` — Domain TypeScript interfaces
- `/src/constants/` — Shift definitions and config constants
- `/src/hooks/` — `useSchedule` for schedule state management
- `/contexts/` — React Context providers (auth, shift config, settings panel)

### Core Data Flow

1. **Import**: Excel upload → `excelParser.ts:parseExcelFile()` → `MonthSchedule[]`
2. **Edit**: UI edits via `useSchedule` hook → `DoctorSchedule[]` / `ShiftCell[]`
3. **Save**: `mapMonthsToTurnosRows()` transforms to DB schema → `upsertTurnosMedicos()` to Supabase
4. **Load**: `fetchTurnosMedicos()` → `mapDbRowsToMonths()` → renders in `ScheduleTable`

### Key Domain Types

- `MonthSchedule`: Array of `DayHeader[]` and `DoctorSchedule[]`
- `ShiftCell`: `{ code: 'M'|'T'|'N'|'L'|'A', hours, concepto }`
- `TurnoMedicoRow`: DB row — doctor, date, shift code, entry/exit times, base hours, recargo hours, concepto, day type (D/H/S)

### Shift Codes

| Code | Name | Default Hours |
|------|------|--------------|
| M | Mañana | 06:00–13:00 (7h) |
| T | Tarde | 13:00–20:00 (7h) |
| N | Noche | 20:00–06:00 (10h) |
| L | Libre | — |
| A | Ausencia | — |

### Recargo (Overtime Premium)

Configurable night window (default 19:00–06:00). When a shift crosses into the night window, premium hours (`horasrecargo`) are computed automatically. Conceptos 35/36/39 classify the overtime type for accounting.

### State Management

- `MedicosTurnosContext` — shift configuration (hours, times, recargo window per shift)
- `SettingsSidebarContext` — right settings panel open/close state
- `AuthContext` — mock auth (localStorage-based); structure is ready for Supabase Auth

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    # Browser-safe anon key
SUPABASE_SERVICE_ROLE_KEY        # Server-only service role key
```

### DB Table: `turnos_medicos`

Columns: `medico`, `fecha`, `turno_codigo`, `entrada`, `salida`, `horas`, `horasrecargo`, `concepto`, `dia` (D=Sunday, H=Weekday, S=Saturday)
