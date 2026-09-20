# Decisiones arquitectónicas (ADR ligero)

Decisiones **ya tomadas**. No se reabren sin un motivo técnico nuevo y
documentado. Si un agente necesita cambiar una, debe añadir una entrada nueva
que la supersede, no editar la anterior.

Formato: `DEC-XXX` · estado · contexto · decisión · consecuencias.

---

## DEC-001 — Supabase (PostgreSQL) es la fuente de verdad
**Estado:** ACCEPTED

**Contexto.** El expediente vivo necesita persistencia auditable, consultable
por dos audiencias (hospital y aseguradora) y con capacidad de notificar
cambios en tiempo real.

**Decisión.** Supabase/PostgreSQL es la única fuente de verdad. Las tablas
`cases` y `case_events` están publicadas para Realtime. El repositorio
in-memory existe solo como fallback de desarrollo y pruebas (DEC-005) y nunca
es la fuente de verdad en un entorno desplegado.

**Consecuencias.** Todo acceso a datos pasa por el puerto `CaseRepository`
(`src/core/repository/case-repository.ts`). Añadir un campo implica migración
SQL + tipo TypeScript + mapeo en `supabase-repository.ts`.

---

## DEC-002 — Datos exclusivamente sintéticos
**Estado:** ACCEPTED

**Contexto.** El dominio es información médica y de pólizas.

**Decisión.** El repositorio no contiene ni contendrá datos reales de
pacientes, pólizas, hospitales o aseguradoras. Todo el dataset es sintético y
está marcado como tal en los propios nombres (`(sintético)`). Los dominios de
correo usan `.example`, reservado por RFC 2606.

**Consecuencias.** Cualquier PR que introduzca datos de origen real se
rechaza. No se conectan fuentes externas de datos clínicos.

---

## DEC-003 — El proveedor de IA está detrás de un puerto
**Estado:** ACCEPTED

**Contexto.** Gemini es la preferencia inicial, pero no queremos acoplarnos.

**Decisión.** Toda la IA pasa por `AiProvider` (`src/core/ai/provider.ts`).
`GeminiProvider` es una implementación; cambiar de proveedor es añadir un
archivo. El resto del sistema no importa nunca el SDK de Google.

**Consecuencias.** El prompt y el JSON Schema de respuesta viven en
`src/core/ai/prompts.ts` y `src/core/domain/schemas.ts`, no dentro del
proveedor.

**Modelo (revisado 2026-09-20):** por defecto `gemini-3.5-flash`.
`gemini-2.5-flash` **se apaga el 16 de octubre de 2026**, así que no se entrega
nada apuntando a él. Cambiar de modelo —por ejemplo a `gemini-3.8-flash`, el
más capaz de la familia flash— es poner `GEMINI_MODEL` en el entorno, sin
tocar código. Ese es exactamente el beneficio de tener el proveedor detrás de
un puerto.

---

## DEC-004 — La relación clínica la decide una tabla declarada, no el modelo
**Estado:** ACCEPTED

**Contexto.** «¿Este antecedente se relaciona con el motivo de ingreso?» es la
pregunta más delicada del reto. Si la responde un LLM, el sistema inventa
preexistencias o las pasa por alto.

**Decisión.** La adyacencia clínica vive en
`src/data/synthetic/clinical-relations.ts`: una tabla explícita y revisable de
`admissionReasonCode → [conditionCode]`. El modelo puede explicar y matizar,
pero no puede crear ni eliminar una relación.

**Consecuencias.** Ampliar la cobertura clínica es añadir filas a una tabla,
no reentrenar ni reescribir prompts. En producción esa tabla vendría de la
política clínica de la aseguradora.

---

## DEC-005 — El sistema arranca y demuestra sin credenciales
**Estado:** ACCEPTED

**Contexto.** Tres personas trabajando en paralelo, un jurado abriendo un
enlace, y claves que pueden no existir todavía.

**Decisión.** Sin Supabase configurado, el sistema usa el repositorio
in-memory. Sin `GEMINI_API_KEY`, usa el analizador determinístico. Ningún
módulo lanza excepción al importarse por falta de variables de entorno.
`GET /api/health` reporta exactamente qué está activo.

**Consecuencias.** El fallback **nunca se disfraza de Gemini**: se identifica
como `deterministic-fallback` en `ai_interactions`, en el timeline y en la
decisión (`source: "AI_UNAVAILABLE"`). Falsificar una llamada a Gemini está
prohibido.

---

## DEC-006 — Un fallo de IA no degrada el caso a revisión humana automáticamente
**Estado:** ACCEPTED

**Contexto.** ¿Qué pasa si Gemini falla en un caso administrativamente limpio?

**Decisión.** Las reglas determinísticas por sí solas bastan para decidir los
tres escenarios. Si la IA no está disponible, el caso se decide con reglas y
la decisión se marca `source: "AI_UNAVAILABLE"`. No se escala a
`HUMAN_REVIEW` solo por la caída del proveedor.

**Justificación.** Escalar todo caso limpio a revisión humana durante una
caída de proveedor inundaría a los gestores y degradaría la seguridad real del
sistema en lugar de mejorarla. La IA aporta narrativa y detección de matices,
no la validez administrativa.

**Consecuencias.** La baja confianza *reportada por el modelo* sí escala
(`LOW_CONFIDENCE`), porque ahí hay señal. La ausencia de modelo, no.

---

## DEC-007 — El Safety Gate es posterior a la IA y solo puede endurecer
**Estado:** ACCEPTED

**Decisión.** El modelo produce una **propuesta** (`AiAnalysis` con
`suggestedStatus`). El estado final lo produce `applySafetyGate`, que toma el
más restrictivo entre el suelo determinístico y la propuesta del modelo. El
modelo nunca puede elevar un caso por encima del suelo.

**Consecuencias.** `AgentDecision.modelSuggestedStatus` y `gateOverrode`
quedan registrados para auditoría: el jurado puede ver exactamente cuándo el
Gate corrigió al modelo.

---

## DEC-008 — El timeline es append-only en la base de datos
**Estado:** ACCEPTED

**Decisión.** `case_events` rechaza `UPDATE` y `DELETE` mediante triggers de
PostgreSQL. El número de secuencia lo asigna la base de datos. El puerto
`CaseRepository` no expone ninguna operación de modificación de eventos.

**Consecuencias.** La inmutabilidad no depende de la disciplina de los
agentes. Un bug de aplicación no puede reescribir la historia de un caso.

**Verificado contra Postgres 17 (2026-09-19):** `UPDATE` y `DELETE` sobre
`case_events` se rechazan con
`case_events is append-only: … is not allowed`, y `seq` la asigna la base de
datos.

**Consecuencia derivada, intencional:** `delete from cases` **tampoco
funciona**. La cascada hacia `case_events` dispara el mismo trigger y aborta
el borrado completo. Un expediente abierto es un registro de auditoría
permanente. Para reiniciar datos de demo se usa `TRUNCATE`, que no dispara
triggers de fila — por eso `supabase/seed.sql` funciona.

---

## DEC-009 — Separación frontend/backend por contratos
**Estado:** ACCEPTED

**Decisión.** `docs/API_CONTRACT.md` es el contrato. El frontend no lee el
código del backend ni el backend asume nada del frontend. Los tipos
compartidos se importan de `src/core/domain/types.ts` y
`src/core/domain/case-status.ts`.

**Consecuencias.** Un cambio de contrato exige actualizar
`docs/API_CONTRACT.md` en el mismo commit y avisar en `docs/HANDOFF.md`.

---

## DEC-010 — Repositorio privado hasta la entrega
**Estado:** ACCEPTED

**Decisión.** `Silentarcherjr/scayl-pulse` se crea privado. Se hace público de
forma deliberada antes de entregar, porque el reto exige un repositorio
consultable por el jurado.

**Comando:** `gh repo edit Silentarcherjr/scayl-pulse --visibility public --accept-visibility-change-consequences`
