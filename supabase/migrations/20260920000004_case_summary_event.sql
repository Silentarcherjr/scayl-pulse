-- =============================================================================
-- Nuevo tipo de evento: CASE_SUMMARY_GENERATED
--
-- El resumen para el gestor (docs/IDEAS.md IDEA-003) se genera bajo demanda y
-- se guarda como un evento del timeline en lugar de en una tabla nueva:
--
--   * queda auditado cuándo se le mostró qué a un gestor;
--   * se reutiliza sin volver a llamar al modelo mientras la decisión no cambie;
--   * hereda la inmutabilidad del timeline sin trabajo extra.
--
-- El resumen es narrativa: se produce DESPUÉS del Safety Gate y recibe la
-- decisión final como entrada, así que puede explicar una decisión pero nunca
-- modificarla.
-- =============================================================================

alter type case_event_type add value if not exists 'CASE_SUMMARY_GENERATED' after 'DECISION_UPDATED';
