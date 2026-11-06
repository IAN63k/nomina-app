-- Cierra al rol anon/authenticated las tablas de respaldo creadas a mano en
-- Supabase, que estaban SIN RLS (cualquiera con la anon key podía leerlas).
-- Ninguna parte de la app las usa; solo la service role puede acceder.
-- Aplicado en Supabase el 2026-11-05.
--
-- Pendiente aparte: turnos_medicos, turnos_auxiliares, turnos_catalogo y
-- user_preferences siguen con política using (true) para anon porque la app
-- las usa desde el navegador; cerrarlas exige pasar esas consultas al servidor.
do $$
declare t text;
begin
  foreach t in array array['respaldo_festivo_13jul2026','respaldo_trash_medicos','respaldo_unificacion_nombres'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
