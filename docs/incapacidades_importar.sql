-- =============================================================================
-- incapacidades_importar: alta atómica de incapacidades (+ pagos y gestiones)
-- =============================================================================
-- Una sola transacción: registra la carga, inserta las incapacidades nuevas
-- (ON CONFLICT DO NOTHING por identificacion + nro_incapacidad: nunca toca lo
-- ya registrado), y solo para las que quedaron insertadas en ESTA llamada
-- agrega sus pagos y gestiones. Así reintentar es seguro (idempotente).
--
-- La usan la migración (scripts/migrar-incapacidades.ts) y la carga de KactuS.
-- Solo la service role puede ejecutarla.
-- =============================================================================

create or replace function public.incapacidades_importar(
  p_carga         jsonb,
  p_incapacidades jsonb,
  p_pagos         jsonb default '[]'::jsonb,
  p_gestiones     jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_carga   uuid;
  v_usuario text := p_carga->>'usuario';
  v_nuevas  int;
  v_pagos   int;
  v_gest    int;
begin
  if v_usuario is null or length(trim(v_usuario)) = 0 then
    raise exception 'p_carga.usuario es obligatorio';
  end if;

  insert into incapacidad_cargas (archivo, tipo, usuario, duplicadas, rechazadas, para_revisar, detalle)
  values (
    p_carga->>'archivo',
    coalesce(p_carga->>'tipo', 'kactus'),
    v_usuario,
    coalesce((p_carga->>'duplicadas')::int, 0),
    coalesce((p_carga->>'rechazadas')::int, 0),
    coalesce((p_carga->>'para_revisar')::int, 0),
    p_carga->'detalle'
  )
  returning id into v_carga;

  drop table if exists pg_temp._incap_nuevas;
  create temp table _incap_nuevas (id uuid, identificacion text, nro_incapacidad text) on commit drop;

  with ins as (
    insert into incapacidades (
      identificacion, nro_incapacidad, nombre, concepto, tipo, es_prorroga, dias, dias_acumulados,
      fecha_desde, fecha_hasta, fecha_radicacion_nomina, fecha_radicacion_eps, valor_incapacidad,
      eps, entidad_kactus, valor_fondo_manual, estado, causal_no_pago, responsable, observacion,
      fin_lactancia, sugerido_transito, para_revisar, origen, carga_id, created_by, updated_by
    )
    select
      trim(x.identificacion), trim(x.nro_incapacidad), x.nombre, x.concepto, x.tipo,
      coalesce(x.es_prorroga, false), x.dias, x.dias_acumulados,
      x.fecha_desde, x.fecha_hasta, x.fecha_radicacion_nomina, x.fecha_radicacion_eps,
      coalesce(x.valor_incapacidad, 0), x.eps, x.entidad_kactus, x.valor_fondo_manual,
      coalesce(x.estado, 'Radicada'), x.causal_no_pago, x.responsable, x.observacion,
      x.fin_lactancia, coalesce(x.sugerido_transito, false), coalesce(x.para_revisar, '{}'),
      x.origen, v_carga, v_usuario, v_usuario
    from jsonb_to_recordset(p_incapacidades) as x(
      identificacion text, nro_incapacidad text, nombre text, concepto int, tipo text,
      es_prorroga boolean, dias int, dias_acumulados int, fecha_desde date, fecha_hasta date,
      fecha_radicacion_nomina date, fecha_radicacion_eps date, valor_incapacidad numeric,
      eps text, entidad_kactus text, valor_fondo_manual numeric, estado text, causal_no_pago text,
      responsable text, observacion text, fin_lactancia date, sugerido_transito boolean,
      para_revisar text[], origen text
    )
    on conflict (identificacion, nro_incapacidad) do nothing
    returning id, identificacion, nro_incapacidad
  )
  insert into _incap_nuevas select * from ins;
  get diagnostics v_nuevas = row_count;

  insert into incapacidad_pagos (incapacidad_id, tramo, fecha_pago, valor, observacion, created_by)
  select n.id, coalesce(p.tramo, 'eps'), p.fecha_pago, p.valor, p.observacion, v_usuario
  from jsonb_to_recordset(p_pagos) as p(identificacion text, nro_incapacidad text, tramo text, fecha_pago date, valor numeric, observacion text)
  join _incap_nuevas n on n.identificacion = trim(p.identificacion) and n.nro_incapacidad = trim(p.nro_incapacidad);
  get diagnostics v_pagos = row_count;

  insert into incapacidad_gestiones (incapacidad_id, fecha, tipo, accion, created_by)
  select n.id, g.fecha, g.tipo, g.accion, v_usuario
  from jsonb_to_recordset(p_gestiones) as g(identificacion text, nro_incapacidad text, fecha date, tipo text, accion text)
  join _incap_nuevas n on n.identificacion = trim(g.identificacion) and n.nro_incapacidad = trim(g.nro_incapacidad);
  get diagnostics v_gest = row_count;

  update incapacidad_cargas set nuevas = v_nuevas where id = v_carga;

  insert into incapacidad_auditoria (tabla, registro_id, accion, valor_nuevo, usuario)
  values ('incapacidad_cargas', v_carga::text, coalesce(p_carga->>'tipo', 'kactus'),
          jsonb_build_object('archivo', p_carga->>'archivo', 'nuevas', v_nuevas, 'pagos', v_pagos,
                             'gestiones', v_gest, 'duplicadas', p_carga->'duplicadas',
                             'rechazadas', p_carga->'rechazadas'),
          v_usuario);

  return jsonb_build_object('carga_id', v_carga, 'nuevas', v_nuevas, 'pagos', v_pagos, 'gestiones', v_gest);
end;
$$;

revoke all on function public.incapacidades_importar(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.incapacidades_importar(jsonb, jsonb, jsonb, jsonb) to service_role;
