-- =============================================================================
-- Cierre humano del caso
--
-- `resolution` guarda la única decisión que toma una persona directamente:
-- quién cerró el caso, por qué, en qué estado lo había dejado el sistema y si
-- contradijo su recomendación. Ese último campo es lo primero que mirará un
-- auditor, por eso se almacena explícitamente en lugar de deducirse.
--
-- El cierre es terminal: un caso RESOLVED no se reabre y rechaza evidencia
-- nueva con 409 (docs/DECISIONS.md DEC-011).
-- =============================================================================

alter table cases add column if not exists resolution jsonb;

create index if not exists cases_resolution_outcome_idx
  on cases ((resolution->>'outcome'))
  where resolution is not null;

comment on column cases.resolution is
  'Cierre humano: outcome, resolvedBy, reason, statusAtResolution y overrodeSystemRecommendation. Null mientras el caso siga abierto.';
