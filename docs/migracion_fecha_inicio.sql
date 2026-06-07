-- Migración: columna `fecha_inicio` y clave por (medico, fecha_inicio, concepto)
-- ---------------------------------------------------------------------------
-- Un turno NOCTURNO que cruza la medianoche se persiste partido en dos fechas físicas
-- (el tramo post-medianoche cae en el día siguiente). Con la clave anterior
-- (medico, fecha, concepto), al recargar desde BD ese tramo contaminaba el día
-- siguiente —a menudo un libre u otro turno— y, en noches consecutivas, se fusionaba
-- con el turno del día siguiente. Resultado: códigos corruptos al recargar
-- (libres → N1, N2 → N1, M1 → N1).
--
-- Solución: cada fila lleva `fecha_inicio` = día en que EMPEZÓ el turno (igual a `fecha`
-- salvo en el tramo post-medianoche). La agregación/reconstrucción y la clave única
-- pasan a (medico, fecha_inicio, concepto), de modo que cada turno se imputa a su día
-- de inicio sin pisar al vecino.
--
-- Ejecutar UNA vez en el SQL editor de Supabase. Requiere haber aplicado antes
-- `migracion_concepto_unique.sql` (PK = medico, fecha, concepto).
--
-- IMPORTANTE: los datos ya guardados se escribieron con el esquema viejo (corruptos).
-- Tras esta migración, VACIAR las tablas y volver a subir/guardar los Excel para
-- regenerarlos limpios (ver el paso 2, opcional pero recomendado).
-- ---------------------------------------------------------------------------

-- ── Paso 1: esquema (turnos_auxiliares) ────────────────────────────────────
begin;
  alter table turnos_auxiliares add column if not exists fecha_inicio date;
  -- Backfill: para filas existentes, fecha_inicio = fecha (permite NOT NULL y la PK).
  update turnos_auxiliares set fecha_inicio = fecha where fecha_inicio is null;
  alter table turnos_auxiliares alter column fecha_inicio set not null;

  -- Reemplazar la PK (medico, fecha, concepto) → (medico, fecha_inicio, concepto).
  alter table turnos_auxiliares drop constraint if exists turnos_auxiliares_pkey;
  alter table turnos_auxiliares
    add constraint turnos_auxiliares_pkey primary key (medico, fecha_inicio, concepto);
commit;

-- ── Paso 1: esquema (turnos_medicos) ───────────────────────────────────────
begin;
  alter table turnos_medicos add column if not exists fecha_inicio date;
  update turnos_medicos set fecha_inicio = fecha where fecha_inicio is null;
  alter table turnos_medicos alter column fecha_inicio set not null;

  alter table turnos_medicos drop constraint if exists turnos_medicos_pkey;
  alter table turnos_medicos
    add constraint turnos_medicos_pkey primary key (medico, fecha_inicio, concepto);
commit;

-- ── Paso 2 (RECOMENDADO): limpiar datos corruptos y re-subir ────────────────
-- Los registros previos quedaron mal partidos por la clave anterior; un simple
-- re-upload (upsert) puede dejar filas huérfanas. Para datos 100% limpios, vaciar
-- y volver a subir los Excel desde la app (Recargos → cargar archivo → Guardar en BD).
--
--   truncate table turnos_auxiliares;
--   truncate table turnos_medicos;
--
-- (Descomentar y ejecutar solo si vas a re-subir los archivos.)

-- ── Verificación (opcional) ─────────────────────────────────────────────────
-- select tc.table_name, kcu.column_name, kcu.ordinal_position
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
-- where tc.constraint_type = 'PRIMARY KEY'
--   and tc.table_name in ('turnos_auxiliares','turnos_medicos')
-- order by tc.table_name, kcu.ordinal_position;
