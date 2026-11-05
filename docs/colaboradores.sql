-- =============================================================================
-- Maestro de colaboradores (ejecutar UNA vez en Supabase)
-- =============================================================================
-- Reemplaza la lista de Empleados que vivía solo en sessionStorage. Aprobado
-- por el responsable de datos el 2026-11-05: se guardan datos de identificación
-- y laborales básicos. NO se guardan salarios ni datos de salud.
--
-- Lo usan: Recargos/Turnos (nombre → cédula para el TXT), Vacaciones (cargo,
-- sede) e Incapacidades (fondo de pensiones; reemplaza la tabla
-- colaborador_fondo_pensiones, que se elimina aquí estando vacía).
--
-- Acceso: RLS sin políticas y sin privilegios para anon/authenticated. Solo
-- app/api/colaboradores/* con service role, sesión firmada y rol.
-- =============================================================================

create table if not exists public.colaboradores (
  -- Alfanumérica: Incapacidades puede registrar extranjeros (pasaporte, PPT).
  identificacion  text primary key check (identificacion ~ '^[A-Za-z0-9-]{3,20}$'),
  nombre          text not null check (length(trim(nombre)) > 0),
  cargo           text,
  sede            text,
  fondo_pensiones text,                              -- se digita a mano (Incapacidades)
  activo          boolean not null default true,
  origen          text,                              -- archivo de la última importación
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_by      text,
  updated_at      timestamptz not null default now()
);
create index if not exists colaboradores_nombre_idx on public.colaboradores (lower(nombre));

alter table public.colaboradores enable row level security;
revoke all on table public.colaboradores from anon, authenticated;

-- El fondo de pensiones pasa al maestro. La tabla anterior está vacía; si no
-- lo estuviera, se copian sus datos antes de eliminarla.
do $$
begin
  if to_regclass('public.colaborador_fondo_pensiones') is not null then
    update public.colaboradores c
       set fondo_pensiones = f.fondo, updated_at = now()
      from public.colaborador_fondo_pensiones f
     where f.identificacion = c.identificacion;
    if exists (select 1 from public.colaborador_fondo_pensiones f
               where not exists (select 1 from public.colaboradores c where c.identificacion = f.identificacion)) then
      raise exception 'colaborador_fondo_pensiones tiene filas sin colaborador: revisar antes de eliminarla';
    end if;
    drop table public.colaborador_fondo_pensiones;
  end if;
end $$;

-- ── Importación (upsert atómico por cédula) ─────────────────────────────────
-- Agrega nuevos y actualiza nombre/cargo/sede/fondo de los existentes. Nunca
-- borra colaboradores. Un cargo, sede o fondo vacío en el archivo no borra el
-- que ya estaba (el fondo llega ya convertido a la lista por la API).
create or replace function public.colaboradores_importar(
  p_usuario       text,
  p_archivo       text,
  p_colaboradores jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_total       int;
  v_nuevos      int;
  v_actualizados int;
begin
  if p_usuario is null or length(trim(p_usuario)) = 0 then
    raise exception 'p_usuario es obligatorio';
  end if;

  select count(*) into v_total from jsonb_array_elements(p_colaboradores);

  with datos as (
    select trim(x.identificacion) as identificacion,
           trim(x.nombre) as nombre,
           nullif(trim(x.cargo), '') as cargo,
           nullif(trim(x.sede), '') as sede,
           nullif(trim(x.fondo_pensiones), '') as fondo_pensiones
    from jsonb_to_recordset(p_colaboradores) as x(identificacion text, nombre text, cargo text, sede text, fondo_pensiones text)
  ),
  up as (
    insert into colaboradores as c (identificacion, nombre, cargo, sede, fondo_pensiones, activo, origen, created_by, updated_by)
    select identificacion, nombre, cargo, sede, fondo_pensiones, true, p_archivo, p_usuario, p_usuario from datos
    on conflict (identificacion) do update set
      nombre     = excluded.nombre,
      cargo      = coalesce(excluded.cargo, c.cargo),
      sede       = coalesce(excluded.sede, c.sede),
      fondo_pensiones = coalesce(excluded.fondo_pensiones, c.fondo_pensiones),
      activo     = true,
      origen     = excluded.origen,
      updated_by = excluded.updated_by,
      updated_at = now()
    where c.nombre is distinct from excluded.nombre
       or (excluded.cargo is not null and c.cargo is distinct from excluded.cargo)
       or (excluded.sede  is not null and c.sede  is distinct from excluded.sede)
       or (excluded.fondo_pensiones is not null and c.fondo_pensiones is distinct from excluded.fondo_pensiones)
       or not c.activo
    returning (xmax = 0) as insertado
  )
  select count(*) filter (where insertado), count(*) filter (where not insertado)
    into v_nuevos, v_actualizados from up;

  insert into incapacidad_auditoria (tabla, registro_id, accion, valor_nuevo, usuario)
  values ('colaboradores', coalesce(p_archivo, '(sin archivo)'), 'importar',
          jsonb_build_object('archivo', p_archivo, 'total', v_total, 'nuevos', v_nuevos,
                             'actualizados', v_actualizados),
          p_usuario);

  return jsonb_build_object('total', v_total, 'nuevos', v_nuevos, 'actualizados', v_actualizados,
                            'sin_cambios', v_total - v_nuevos - v_actualizados);
end;
$$;

revoke all on function public.colaboradores_importar(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.colaboradores_importar(text, text, jsonb) to service_role;
