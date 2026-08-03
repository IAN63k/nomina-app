-- Catálogo de turnos personalizados (médicos y auxiliares), usado por
-- src/services/turnosCatalogoDb.ts. Aplicada en Supabase como migración
-- `create_turnos_catalogo`; este archivo es la referencia.
--
-- Compartido por todos los usuarios (no es una preferencia personal): interpreta datos
-- ya guardados en turnos_medicos/turnos_auxiliares (turno_codigo), así que el catálogo
-- debe ser el mismo para todos. Solo se persisten los turnos personalizados (los que no
-- están en el catálogo por defecto de cada módulo) — ver DEFAULT_CODES / AUX_DEFAULT_CODES.

create table if not exists public.turnos_catalogo (
  modulo      text        not null check (modulo in ('medicos', 'auxiliares')),
  codigo      text        not null,
  entrada     text        not null default '',
  salida      text        not null default '',
  total       text        not null default '0',
  descripcion text        not null default '',
  updated_at  timestamptz not null default now(),
  primary key (modulo, codigo)
);

-- La app usa auth propia (RPC verificar_login) con la anon key en el navegador,
-- no Supabase Auth, así que la política debe permitir al rol anon.
alter table public.turnos_catalogo enable row level security;

create policy "turnos_catalogo_anon_all"
  on public.turnos_catalogo
  for all
  to anon, authenticated
  using (true)
  with check (true);
