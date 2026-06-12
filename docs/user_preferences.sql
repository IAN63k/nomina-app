-- Tabla de preferencias de usuario por clave (JSON), usada por
-- src/services/userPreferences.ts. Aplicada en Supabase como migración
-- `create_user_preferences` (junio 2026); este archivo es la referencia.

create table if not exists public.user_preferences (
  usuario    text        not null,
  clave      text        not null,
  valor      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (usuario, clave)
);

-- La app usa auth propia (RPC verificar_login) con la anon key en el navegador,
-- no Supabase Auth, así que la política debe permitir al rol anon.
alter table public.user_preferences enable row level security;

create policy "user_preferences_anon_all"
  on public.user_preferences
  for all
  to anon, authenticated
  using (true)
  with check (true);
