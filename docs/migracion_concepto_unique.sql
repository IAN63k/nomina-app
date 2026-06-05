-- Migración: clave única por (medico, fecha, concepto)
-- ---------------------------------------------------------------------------
-- Las tablas `turnos_auxiliares` y `turnos_medicos` se crearon con la primary key
-- sobre (medico, fecha). Eso impide que un mismo día tenga varias filas de conceptos
-- distintos (recargo nocturno 35/36/39 + horas extra 31–34), que es justo lo que
-- produce el motor de recargos. Al guardar, el upsert usa onConflict (medico, fecha,
-- concepto), así que la restricción única debe cubrir exactamente esas tres columnas.
--
-- Síntoma sin esta migración:
--   duplicate key value violates unique constraint "turnos_auxiliares_pkey"
--   Key (medico, fecha)=(... , 2026-01-26) already exists.
--
-- Ejecutar UNA vez en el SQL editor de Supabase. Es idempotente y seguro: como la PK
-- anterior era (medico, fecha), no puede haber duplicados sobre (medico, fecha, concepto).
-- ---------------------------------------------------------------------------

-- ── turnos_auxiliares (este es el que produce el error reportado) ───────────
-- En su propia transacción para que se aplique con independencia de médicos.
begin;
  -- concepto entra en la PK → no puede ser NULL.
  update turnos_auxiliares set concepto = 0 where concepto is null;
  alter table turnos_auxiliares alter column concepto set not null;
  alter table turnos_auxiliares alter column concepto set default 0;

  alter table turnos_auxiliares drop constraint if exists turnos_auxiliares_pkey;
  alter table turnos_auxiliares drop constraint if exists turnos_auxiliares_medico_fecha_concepto_key;
  alter table turnos_auxiliares
    add constraint turnos_auxiliares_pkey primary key (medico, fecha, concepto);
commit;

-- ── turnos_medicos (misma regla, preventivo) ───────────────────────────────
-- turnos_medicos comparte el mismo diseño; se migra para evitar el mismo error
-- en cuanto un día de médicos genere más de un concepto. Transacción aparte:
-- si médicos ya estaba migrado o tuviera duplicados, esto puede fallar sin
-- afectar la migración de auxiliares de arriba.
begin;
  update turnos_medicos set concepto = 0 where concepto is null;
  alter table turnos_medicos alter column concepto set not null;
  alter table turnos_medicos alter column concepto set default 0;

  alter table turnos_medicos drop constraint if exists turnos_medicos_pkey;
  alter table turnos_medicos drop constraint if exists turnos_medicos_medico_fecha_concepto_key;
  alter table turnos_medicos
    add constraint turnos_medicos_pkey primary key (medico, fecha, concepto);
commit;

-- Verificación (opcional): debe listar (medico, fecha, concepto) en ambas PK.
-- select tc.table_name, kcu.column_name, kcu.ordinal_position
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on kcu.constraint_name = tc.constraint_name
-- where tc.constraint_type = 'PRIMARY KEY'
--   and tc.table_name in ('turnos_auxiliares', 'turnos_medicos')
-- order by tc.table_name, kcu.ordinal_position;
