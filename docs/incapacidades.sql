-- =============================================================================
-- Módulo de Incapacidades — esquema (ejecutar UNA vez en Supabase, SQL Editor)
-- =============================================================================
-- Seguridad (RNF-01): datos personales, de salud y de dinero.
--   * RLS activo y SIN políticas → anon/authenticated no leen ni escriben nada.
--   * Además se revocan los privilegios de tabla a anon/authenticated.
--   * Todo acceso pasa por app/api/incapacidades/* con SUPABASE_SERVICE_ROLE_KEY,
--     después de validar la sesión firmada y el rol (src/lib/requireSession.ts).
--   * El diagnóstico NO se guarda: solo la marca `sugerido_transito`.
--
-- Valores calculados (saldo, alerta de cobro, días desde radicación, tramos
-- EPS/fondo, hitos…) NO se guardan: los calcula src/services/incapacidadesEngine.ts,
-- única fuente de verdad. Aquí solo van datos digitados o cargados.
-- =============================================================================

create extension if not exists pgcrypto;

-- ── Incapacidades (datos de KactuS + seguimiento digitado) ──────────────────
create table if not exists public.incapacidades (
  id                      uuid primary key default gen_random_uuid(),
  identificacion          text not null,
  nro_incapacidad         text not null,          -- normalizado (trim)
  nombre                  text not null,
  concepto                integer,                -- 121, 122, 123, 124 (KactuS)
  tipo                    text not null,          -- lista "tipo de incapacidad"
  es_prorroga             boolean not null default false,
  dias                    integer not null check (dias >= 0),
  dias_acumulados         integer not null check (dias_acumulados >= 0),
  fecha_desde             date not null,
  fecha_hasta             date not null,
  fecha_radicacion_nomina date,
  fecha_radicacion_eps    date,
  valor_incapacidad       numeric(14,0) not null default 0,
  eps                     text,                   -- nombre corto (lista EPS)
  entidad_kactus          text,                   -- "Nombre Entidad" tal como vino
  -- Cobro desde el día 181: la parte de días > 180 se cobra al fondo de
  -- pensiones. Por defecto el valor se reparte en proporción a los días; si
  -- nómina digita el valor del tramo del fondo, manda este campo.
  valor_fondo_manual      numeric(14,0) check (valor_fondo_manual >= 0),
  estado                  text not null default 'Radicada',
  causal_no_pago          text,
  responsable             text,
  observacion             text,                   -- "REG. INCAP - …" + notas
  fin_lactancia           date,
  sugerido_transito       boolean not null default false,
  para_revisar            text[] not null default '{}',
  origen                  text,                   -- archivo / "migración"
  carga_id                uuid,
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_by              text,
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,            -- borrado lógico
  constraint incapacidades_fechas_chk check (fecha_hasta >= fecha_desde),
  constraint incapacidades_llave unique (identificacion, nro_incapacidad)
);
create index if not exists incapacidades_identificacion_idx on public.incapacidades (identificacion, fecha_hasta);
create index if not exists incapacidades_estado_idx         on public.incapacidades (estado);
create index if not exists incapacidades_eps_idx            on public.incapacidades (eps);
create index if not exists incapacidades_tipo_idx           on public.incapacidades (tipo);

-- ── Pagos (varios por incapacidad; anulación con motivo, nunca DELETE) ──────
create table if not exists public.incapacidad_pagos (
  id               uuid primary key default gen_random_uuid(),
  incapacidad_id   uuid not null references public.incapacidades(id),
  tramo            text not null default 'eps' check (tramo in ('eps','fondo')),
  fecha_pago       date not null,
  valor            numeric(14,0) not null check (valor > 0),
  observacion      text,
  anulado          boolean not null default false,
  motivo_anulacion text,
  anulado_por      text,
  anulado_at       timestamptz,
  created_by       text not null,
  created_at       timestamptz not null default now(),
  constraint incapacidad_pagos_anulacion_chk
    check (not anulado or (motivo_anulacion is not null and length(trim(motivo_anulacion)) > 0))
);
create index if not exists incapacidad_pagos_inc_idx on public.incapacidad_pagos (incapacidad_id);

-- ── Gestiones (historial: llamadas, correos, reclamaciones) ─────────────────
create table if not exists public.incapacidad_gestiones (
  id             uuid primary key default gen_random_uuid(),
  incapacidad_id uuid not null references public.incapacidades(id),
  fecha          date not null,
  tipo           text not null,                   -- Llamada, Correo, Reclamación, Otra
  accion         text not null,
  responsable    text,
  created_by     text not null,
  created_at     timestamptz not null default now()
);
create index if not exists incapacidad_gestiones_inc_idx on public.incapacidad_gestiones (incapacidad_id, fecha);

-- ── PQRD ─────────────────────────────────────────────────────────────────────
create table if not exists public.incapacidad_pqrd (
  id                uuid primary key default gen_random_uuid(),
  incapacidad_id    uuid not null references public.incapacidades(id),
  radicado          text not null,
  entidad           text not null,
  fecha_radicacion  date not null,
  motivo            text not null,
  fecha_limite      date not null,                -- radicación + N días hábiles (motor)
  estado            text not null default 'Abierta'
                    check (estado in ('Abierta','Respondida a favor','Respondida en contra')),
  fecha_respuesta   date,
  resumen_respuesta text,
  soporte_path      text,                         -- objeto en bucket incapacidades-soportes
  created_by        text not null,
  created_at        timestamptz not null default now(),
  updated_by        text,
  updated_at        timestamptz not null default now()
);
create index if not exists incapacidad_pqrd_inc_idx    on public.incapacidad_pqrd (incapacidad_id);
create index if not exists incapacidad_pqrd_estado_idx on public.incapacidad_pqrd (estado, fecha_limite);

-- ── Fondo de pensiones por colaborador (se digita a mano) ───────────────────
create table if not exists public.colaborador_fondo_pensiones (
  identificacion text primary key,
  fondo          text not null,                   -- Colpensiones, Porvenir, Protección, Colfondos, Skandia
  updated_by     text,
  updated_at     timestamptz not null default now()
);

-- ── Alertas (hitos de días, previas y PQRD vencidas) ────────────────────────
-- `clave` hace idempotente la generación: una sola alerta por colaborador,
-- cadena de prórrogas, hito y tipo, aunque el archivo se cargue de nuevo.
create table if not exists public.incapacidad_alertas (
  id                 uuid primary key default gen_random_uuid(),
  clave              text not null unique,
  tipo               text not null check (tipo in ('hito','previa','pqrd_vencida')),
  identificacion     text not null,
  nombre             text,
  cadena             text,                        -- nro de la incapacidad que abre la cadena
  hito               integer,                     -- 90, 120, 150, 180
  dias_acumulados    integer,
  fecha_cumplimiento date,
  incapacidad_id     uuid references public.incapacidades(id),
  pqrd_id            uuid references public.incapacidad_pqrd(id),
  eps                text,
  accion_sugerida    text,
  estado             text not null default 'Pendiente' check (estado in ('Pendiente','Atendida')),
  atendida_por       text,
  atendida_at        timestamptz,
  nota               text,
  enviada_at         timestamptz,                 -- correo (pendiente: hoy solo se ve en la app)
  created_at         timestamptz not null default now(),
  constraint incapacidad_alertas_atencion_chk
    check (estado = 'Pendiente' or (atendida_por is not null and atendida_at is not null and nota is not null))
);
create index if not exists incapacidad_alertas_estado_idx on public.incapacidad_alertas (estado, created_at);
create index if not exists incapacidad_alertas_ident_idx  on public.incapacidad_alertas (identificacion);

-- ── Registro de cargas ───────────────────────────────────────────────────────
create table if not exists public.incapacidad_cargas (
  id           uuid primary key default gen_random_uuid(),
  archivo      text not null,
  tipo         text not null default 'kactus' check (tipo in ('kactus','pagos','migracion')),
  usuario      text not null,
  nuevas       integer not null default 0,
  duplicadas   integer not null default 0,
  rechazadas   integer not null default 0,
  para_revisar integer not null default 0,
  detalle      jsonb,                             -- rechazadas con motivo, etc. (sin diagnóstico)
  created_at   timestamptz not null default now()
);

-- ── Parámetros y listas ──────────────────────────────────────────────────────
create table if not exists public.incapacidad_parametros (
  clave      text primary key,
  valor      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.incapacidad_parametros (clave, valor) values
  ('fecha_corte',               'null'),           -- null = hoy (America/Bogota)
  ('dias_mora',                 '60'),
  ('meses_prescripcion',        '36'),              -- por validar con jurídica
  ('meses_anticipacion_prescripcion', '6'),
  ('tolerancia_redondeo',       '1000'),
  ('dias_habiles_pqrd',         '15'),
  ('hitos_dias',                '[90,120,150,180]'),
  ('dias_alerta_previa',        '15'),
  ('dias_minimos_sugerencia_transito', '30'),
  ('correos_alertas',           '["auxiliarcompensacionsalarial@sos.com.co","mvramirez@sos.com.co"]'),
  ('lista_eps',                 '["SOS","Sanitas","Sura","Coosalud","Nueva EPS","Salud Total","Comfenalco Valle","Compensar","Coomeva","Famisanar","Mutual Ser","Colmena ARL","Emssanar","Mallamas EPSI"]'),
  ('lista_fondos',              '["Colpensiones","Porvenir","Protección","Colfondos","Skandia"]'),
  ('lista_estados',             '["Radicada","En trámite","Pagada parcial","Pagada","Rechazada","Prescrita","Castigada","Sin subsidio"]'),
  ('lista_causales',            '["IPS no adscrita a la red","IPS no adscrita y sin justificación de ausencia ante la EPS","No cumple mínimo de semanas de cotización","Diferencia de cotización por salario integral","Pago proporcional a periodos cotizados","Dictamen de pensión","Traslape de fechas con otra cobertura","Prescrita","Incapacidad superior a 180 días","Concepto de rehabilitación no favorable","Otra"]'),
  ('lista_tipos',               '["Enfermedad general","Licencia de maternidad","Licencia de paternidad","Accidente de trabajo","Accidente de tránsito","Enfermedad laboral"]')
on conflict (clave) do nothing;

-- ── Auditoría (RNF-02) ───────────────────────────────────────────────────────
create table if not exists public.incapacidad_auditoria (
  id             bigint generated always as identity primary key,
  tabla          text not null,
  registro_id    text not null,
  accion         text not null,                   -- insert, update, anular, atender, carga…
  campo          text,
  valor_anterior jsonb,
  valor_nuevo    jsonb,
  usuario        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists incapacidad_auditoria_reg_idx on public.incapacidad_auditoria (tabla, registro_id);

-- ── Cierre de acceso: RLS sin políticas + revocar privilegios ───────────────
do $$
declare t text;
begin
  foreach t in array array[
    'incapacidades','incapacidad_pagos','incapacidad_gestiones','incapacidad_pqrd',
    'colaborador_fondo_pensiones','incapacidad_alertas','incapacidad_cargas',
    'incapacidad_parametros','incapacidad_auditoria'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Bucket privado para soportes de PQRD (PDF / imagen) ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incapacidades-soportes', 'incapacidades-soportes', false, 10485760,
        array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;
-- Sin políticas en storage.objects para este bucket: solo la service role accede.
