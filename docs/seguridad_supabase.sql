-- =============================================================================
-- Cierre del acceso anónimo (anon key) — v1.19.1
-- =============================================================================
-- La anon key viaja en el navegador: con ella cualquiera podía leer/modificar
-- los turnos, vaciarlos, alterar el catálogo, leer preferencias ajenas y probar
-- contraseñas contra verificar_login. Desde v1.19.1 el navegador ya NO habla
-- directo con Supabase: todo pasa por app/api/* (service role + sesión firmada
-- + rol). Este script quita los permisos que quedaron abiertos.
--
-- ORDEN OBLIGATORIO: aplicar SOLO después de que v1.19.1 esté en producción.
-- Antes de eso, la versión publicada usa la anon key y dejaría de funcionar.
-- =============================================================================

-- 1) verificar_login: solo desde el servidor. (Aplicado el 2026-11-05: la app ya
--    la llamaba solo con service role.) crypt() vive en el esquema extensions.
alter function public.verificar_login(text, text) set search_path = public, extensions;
revoke all on function public.verificar_login(text, text) from public, anon, authenticated;
grant execute on function public.verificar_login(text, text) to service_role;

-- 2) Funciones de la papelera de turnos (security definer): solo service role.
do $$
declare f text;
begin
  foreach f in array array[
    'vaciar_turnos_medicos(text)', 'vaciar_turnos_auxiliares(text)',
    'restaurar_turnos_medicos()', 'restaurar_turnos_auxiliares()',
    'ultima_eliminacion_turnos_medicos()', 'ultima_eliminacion_turnos_auxiliares()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 3) Tablas: sin políticas para anon/authenticated y sin privilegios.
drop policy if exists turnos_medicos_rw         on public.turnos_medicos;
drop policy if exists turnos_auxiliares_rw      on public.turnos_auxiliares;
drop policy if exists turnos_catalogo_anon_all  on public.turnos_catalogo;
drop policy if exists user_preferences_anon_all on public.user_preferences;

do $$
declare t text;
begin
  foreach t in array array[
    'turnos_medicos', 'turnos_auxiliares', 'turnos_medicos_trash', 'turnos_auxiliares_trash',
    'turnos_catalogo', 'user_preferences'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
