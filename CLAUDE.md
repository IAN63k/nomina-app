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

### Horas Extra — tope semanal (44h normal / 37h con festivo)

Colombian rule: the ordinary weekly journey is **44h** (`WEEKLY_ORDINARY_CAP`; vigente hasta jul-2026, luego 42h por Ley 2101), but **if a week contains at least one holiday it drops to 37h** (`WEEKLY_FESTIVO_CAP`) for médicos and auxiliares. Anything worked beyond the applicable cap that week is reclassified as overtime (hora extra), **exclusive** of the ordinary night recargo (a given hour is either ordinary-with-recargo or extra, never both).

- Engine: `recargoEngine.ts` builds per-date segments, then a weekly pass (`buildTurnoRows`) groups by `(medico, Mon–Sun week)`. It accumulates worked hours chronologically and, once the weekly cap (`weeklyCap = festivoWeek ? 37 : 44`) is reached, splits the crossing shift into ordinary + extra and classifies the excess. **Caveat**: hours logged without a shift code (no M/T/N → no schedule) can't be classified into a franja, so they pass through as concepto 0 and do **not** count toward the cap; fix in the programación if they should generate overtime.
- Holidays come from `src/services/festivosColombia.ts` (`isFestivoColombia`: fixed + Ley Emiliani + Easter-based), applied to **both** módulos. Auxiliares' `/DF` reinforces it. Plain Sundays do **not** trigger the 37h reduction. Médicos now also honors calendar holidays for recargo/extra classification.
- Extra conceptos (quantity = extra hours, carried in `horasrecargo` so the TXT exports them): **31** diurna ordinaria (L–S, 06:00–19:00), **32** nocturna ordinaria (L–S, 19:00–06:00), **33** festiva diurna (dom/festivo, 06:00–19:00), **34** festiva nocturna (dom/festivo, 19:00–06:00). The diurnal/nocturnal split uses the shared `recargoConfig` night window.
- Rows aggregate by `(medico, fechaInicio, concepto)` — a day may yield several rows. A night shift split across midnight shares one `fechaInicio` (its start day) so it is attributed there, not to the next day. The DB unique key must match; run `docs/migracion_concepto_unique.sql` then `docs/migracion_fecha_inicio.sql` once in Supabase.

### Recargos Module (Médicos & Auxiliares)

The Recargos page (`/recargos`) has two tabs that share one pure calculation engine — **`src/services/recargoEngine.ts` is the single source of truth**; the detail table, TXT export, and DB save all derive from `buildTurnoRows`. Never duplicate recargo logic in the UI. A shift crossing midnight is split into two rows (entry→24:00, then 00:00→exit with the `nightDiffHours` discount), aggregated by `(medico, fechaInicio)` — both halves carry the start day's `fechaInicio` so reload (`buildMonthsFromRows`) rebuilds the grid on the start day instead of corrupting the next day.

- **Médicos**: catalog M/T/N/L/A → `turnosMedicosDb.ts` → table `turnos_medicos` (no `festivo` column). Parser `excelParser.ts`.
- **Auxiliares**: multi-char catalog (M1/M2/T1/T2/T3/N1/N2 + absences) → `turnosAuxiliaresDb.ts` → table `turnos_auxiliares` (mirror + `festivo` column, **must be created manually** via `docs/turnos_auxiliares.sql`). Parser `auxiliaresParser.ts` (weekly stacked blocks); `/DF` suffix = holiday (computed as Sunday); `N` resolves to N1/N2 by hours.

The `recargoConfig` (night window + discount) lives in `SettingsSidebarContext` and is **shared** by both tabs. The Core Data Flow above describes the Médicos path; Auxiliares mirrors it through the same engine.

### Cartas de Vacaciones Module (`/vacaciones`)

Mail-merge that generates one vacation letter per employee, porting the Python tool in `docs/cartas/` (`generar_cartas_referencia.py`). A Word template with `{MARKER}` placeholders is combined with an Excel sheet whose headers match those markers exactly.

- Engine: `src/services/cartasVacaciones.ts` (single source of truth). UI: `components/vacaciones/cartas-vacaciones.tsx`.
- **Template**: bundled at `public/templates/carta_vacaciones.docx` (the real letter, copy in `docs/cartas/`); the user may upload a custom `.docx`. Rendering uses **docxtemplater + pizzip** with default `{ }` delimiters and a **literal parser** (`scope[tag]`, plus `tag === "."` → current scope) so markers with spaces/dots work (`{PERIODO 1}`, `{C.T}`) **and loops/sections work** (`{#PERIODOS}…{/PERIODOS}`, `{#HAY_COMPENSADOS}…{/HAY_COMPENSADOS}`); `paragraphLoop:true` + `nullGetter` leaves unmatched markers blank.
- **Excel**: read with `xlsx` (`cellDates:true`, local date getters give the correct calendar day). Default sheet `PROGRAMACION` (selectable). Value formatting mirrors the Python: long Spanish dates (`1 de junio de 2026`), short `dd/mm/aaaa` for `COLUMNAS_FECHA_CORTA` (`PERIODO 1/2`), integers without decimals, dates < 1900 treated as empty.
- **Períodos acumulados / compensados (FIFO)**: the letter's period block is a **docxtemplater loop**, fed by `construirVacaciones()`. Periods come from a second sheet (type `VAC ANUAL …`, **auto-detected** by columns `Id. Empleado`/`Fecha Inicial`/`Fecha Final`/`Acumulado Dias` via `extractAcumulados`), joined to PROGRAMACION by **cédula** (`normalizarCedula` → digits only). Only **causado** periods are shown: `Fecha Final ≤ fechaRef` (last day of the carta's month/year, `fechaReferenciaCarta`) **and** `Acumulado Dias > 0`, oldest first. `SALDO_FINAL = Σ días causados − (DIAS_TOMA + COMPENSADAS)` (FIFO: oldest period consumed first, the next is pulled automatically); `{COMPENSADOS}` line only renders when `> 0`. **Fallback**: a cédula with no causado periods (or no acumulados sheet) keeps the current single-period behavior, reconstructed from `PERIODO 1/2 + DIAS_TIENE`. Computed markers (`PERIODOS, INICIO, FIN, DIAS, TOMA, COMPENSADOS, SALDO_FINAL, HAY_COMPENSADOS` → `MARCADORES_CALCULADOS`) are excluded from the "missing column" warning and the manual form, like `{SALDO}`/`{FECHACARTA}`. Render values are built per-row by the component's `prepara(row)` (data + `{FECHACARTA}` + vacation block) and passed to `generarZip`/`generarPdf`/`cartaBlob`.
- **Empty-row filter**: a row is kept only if it has an identity value (`NOMBRE`/`APELLIDO`/`CEDULA`); this drops the many "noise" rows that carry only a stray `DIAS_TOMA: 0`. Falls back to "any non-empty cell" if the sheet has no identity columns.
- **Output**: Word (`.docx` single, or a ZIP via `jszip`) or **PDF**. PDF is generated **100% in the browser** (`src/services/cartasPdfClient.ts`): the merged `.docx` is rendered with `docx-preview` inside a hidden **iframe** and each page is captured to PDF via **`html-to-image`** (SVG foreignObject) + `jsPDF`. Single → one `.pdf`; multiple → ZIP. Libs are dynamically imported so they don't bloat the initial bundle. Client-only **on purpose** — prod runs on Vercel/serverless without LibreOffice; the old `soffice` server route was removed. Three details are load-bearing, learned the hard way: (1) **`html-to-image`, not `html2canvas`** — html2canvas reimplements rendering and dropped the body or header/footer; foreignObject delegates to the real browser engine and is faithful. (2) render inside an **iframe** — the app's global Tailwind CSS bled into an in-document container and made html-to-image clip the absolutely-positioned header/footer. (3) `docx-preview` with **`useBase64URL: true`** (images as data URLs, required by foreignObject) and capture with `overflow:visible` + `scrollWidth/Height` so the right-margin logo isn't clipped. PDFs are image-based (~250 KB/page, text not selectable). `generarPdf` takes an `onProgress(done, total)` callback for the UI.

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

Columns: `medico`, `fecha`, `fecha_inicio`, `turno_codigo`, `entrada`, `salida`, `horas`, `horasrecargo`, `concepto`, `dia` (D=Sunday, H=Weekday, S=Saturday). Unique key: `(medico, fecha_inicio, concepto)` — multiple conceptos per day coexist as separate rows; `fecha` is the physical date, `fecha_inicio` the shift's start day (differ only on a night's post-midnight half).
