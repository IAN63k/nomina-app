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
- `ShiftCell`: `{ code: string, hours, festivo? }` — `code` is a generic `string` (not the `ShiftCode` union) so it can hold multi-char auxiliar codes (M1, M2, T1, N1…). Médicos uses the M/T/N/L/A subset; `festivo` is auxiliares-only.
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

### Recargos Module (Médicos & Auxiliares)

The Recargos page (`/recargos`) has two tabs that share one pure calculation engine — **`src/services/recargoEngine.ts` is the single source of truth**; the detail table, TXT export, and DB save all derive from `buildTurnoRows`. Never duplicate recargo logic in the UI. A shift crossing midnight is split into two rows (entry→24:00, then 00:00→exit with the `nightDiffHours` discount), aggregated by `(medico, fecha)`.

- **Médicos**: catalog M/T/N/L/A → `turnosMedicosDb.ts` → table `turnos_medicos` (no `festivo` column). Parser `excelParser.ts`.
- **Auxiliares**: multi-char catalog (M1/M2/T1/T2/T3/N1/N2 + absences) → `turnosAuxiliaresDb.ts` → table `turnos_auxiliares` (mirror + `festivo` column, **must be created manually** via `docs/turnos_auxiliares.sql`). Parser `auxiliaresParser.ts` (weekly stacked blocks); `/DF` suffix = holiday (computed as Sunday); `N` resolves to N1/N2 by hours.

The `recargoConfig` (night window + discount) lives in `SettingsSidebarContext` and is **shared** by both tabs. The Core Data Flow above describes the Médicos path; Auxiliares mirrors it through the same engine.

### State Management

- `MedicosTurnosContext` — shift configuration (hours, times, recargo window per shift)
- `SettingsSidebarContext` — right settings panel open/close state
- `AuthContext` — real auth via Supabase RPC. Login posts to `/api/auth/login` → `supabase.rpc("verificar_login", {p_usuario, p_password})` (server-side, uses `SUPABASE_SERVICE_ROLE_KEY`). The session (`auth_user`) is cached in localStorage; verification is not mock. Clients: `src/lib/supabase-browser.ts` / `supabase-server.ts`. See `docs/AUTH.md`.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    # Browser-safe anon key
SUPABASE_SERVICE_ROLE_KEY        # Server-only service role key
```

### DB Table: `turnos_medicos`

Columns: `medico`, `fecha`, `turno_codigo`, `entrada`, `salida`, `horas`, `horasrecargo`, `concepto`, `dia` (D=Sunday, H=Weekday, S=Saturday)
