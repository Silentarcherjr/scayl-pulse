-- =============================================================================
-- Seguridad: fijar search_path en las funciones de trigger
--
-- El linter de Supabase (0011_function_search_path_mutable) marca las
-- funciones sin search_path fijo: si un rol puede crear objetos en un esquema
-- que aparezca antes en la ruta de búsqueda, puede secuestrar los nombres que
-- la función resuelve. Las fijamos a '' y calificamos cada referencia.
--
-- Comportamiento sin cambios: mismas funciones, mismos triggers.
-- =============================================================================

create or replace function public.case_events_assign_seq() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1 into new.seq
      from public.case_events where case_id = new.case_id;
  end if;
  return new;
end;
$$;

create or replace function public.case_events_reject_mutation() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'case_events is append-only: % is not allowed', tg_op;
end;
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Nota de comportamiento (verificada contra Postgres 17, 2026-09-19):
--
-- `delete from cases` NO funciona. La cascada hacia case_events dispara el
-- trigger append-only y aborta el borrado completo. Es intencional: un
-- expediente abierto es un registro de auditoría permanente.
--
-- Para reiniciar datos de demo usa TRUNCATE, no DELETE: los triggers de fila
-- no se disparan con TRUNCATE (por eso supabase/seed.sql funciona).
-- -----------------------------------------------------------------------------

comment on table public.case_events is
  'Timeline de auditoría append-only. UPDATE y DELETE están rechazados por trigger. Reiniciar solo con TRUNCATE.';

comment on table public.ai_interactions is
  'Auditoría de llamadas al proveedor de IA. Sin política RLS a propósito: las respuestas crudas del modelo son un artefacto interno, legible solo desde el servidor con la service-role key.';
