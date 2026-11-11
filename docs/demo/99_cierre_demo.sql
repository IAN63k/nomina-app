-- =============================================================================
-- Proyecto Supabase DEMO — cierre de acceso y parámetros ficticios
-- =============================================================================
-- Igual que en producción: nada para anon/authenticated, todo pasa por
-- app/api/* con service role. (verificar_login no existe en la demo: el
-- usuario demo se valida con DEMO_USUARIO/DEMO_PASSWORD.)
-- =============================================================================

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

-- Los correos de alertas de producción no deben quedar en la demo.
update public.incapacidad_parametros
   set valor = '["alertas@demo.example"]'::jsonb, updated_by = 'demo'
 where clave = 'correos_alertas';
