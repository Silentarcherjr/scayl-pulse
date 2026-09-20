# Arquitectura

Arquitectura limpia **sin sobreingeniería**. El objetivo es un MVP que un
jurado entienda en cinco minutos y que tres personas puedan tocar en paralelo
sin pisarse.

## Flujo base — ingreso

```
Hospital / Simulador
        │  POST /api/admissions  (webhook)
        ▼
┌───────────────────────────────────────────────────────┐
│ CaseOrchestrator                                      │
│   src/core/orchestrator/case-orchestrator.ts          │
└───────────────────────────────────────────────────────┘
        │
        ├─► createCase + ADMISSION_RECEIVED / PATIENT_IDENTIFIED
        │
        ├─► buildCaseFacts()            src/core/orchestrator/case-facts.ts
        │     ├─ validatePolicy()       src/core/policy/policy-service.ts
        │     ├─ evaluateDocuments()    src/core/policy/document-requirements.ts
        │     └─ assessHistory()        src/core/history/history-service.ts
        │
        ├─► analyzeEvidence()           src/core/ai/evidence-analyzer.ts
        │     └─ AiProvider ──► GeminiProvider | DeterministicProvider
        │        (structured output → JSON → Zod → AiAnalysis | null)
        │
        ├─► applySafetyGate()           src/core/safety/safety-gate.ts
        │     floor(reglas) ⊕ propuesta(modelo) = AgentDecision
        │
        ├─► updateCaseDecision() + CASE_CLASSIFIED
        │
        └─► notifyBothChannels()        src/core/notifications/notifier.ts
              ├─ HOSPITAL_ADMISSIONS    (paralelo)
              └─ INSURER_CASE_MANAGER   (paralelo)
```

## Flujo de reevaluación — nueva evidencia

```
POST /api/cases/:id/evidence
        │
        ├─► addEvidence + NEW_EVIDENCE_RECEIVED
        ├─► transición a REASSESSING + REASSESSMENT_STARTED
        ├─► [mismo pipeline: facts → AI → Safety Gate]
        ├─► DECISION_UPDATED   ← la decisión anterior NO se borra
        └─► notificación marcada como actualización
```

## Capas

| Capa | Ruta | Responsabilidad | Conoce a |
|---|---|---|---|
| **Dominio** | `src/core/domain/` | Estados, tipos, esquemas Zod, findings | nada |
| **Reglas** | `src/core/policy/`, `src/core/history/` | Validación determinística | dominio |
| **IA** | `src/core/ai/` | Puerto de proveedor, prompts, validación | dominio |
| **Safety** | `src/core/safety/` | Catálogo de reglas y Safety Gate | dominio, facts |
| **Orquestación** | `src/core/orchestrator/` | Pipeline, transiciones, eventos | todo lo anterior |
| **Persistencia** | `src/core/repository/` | Puerto + Supabase + in-memory | dominio |
| **Transporte** | `src/app/api/` | HTTP, validación de entrada, envelope | orquestación |
| **UI** | `src/app/` (resto) | Dashboards (Workstream B) | solo la API |

**Regla de dependencia:** las flechas apuntan hacia adentro. `src/core/domain`
no importa nada de `src/app`. La UI no importa nada de `src/core` salvo tipos.

## Decisiones que sostienen la arquitectura

### El modelo propone, las reglas disponen

El analizador devuelve `AiAnalysis` con un `suggestedStatus`. **No** devuelve
un estado final. El estado final lo produce el Safety Gate:

```ts
const floor  = reglasDeterminísticas(facts);        // VERIFIED | DOCUMENTS_REQUIRED | HUMAN_REVIEW
const status = mostRestrictive(floor, suggested);   // el modelo solo puede endurecer
```

Esto es lo que hace que «el LLM no puede saltarse el Safety Gate» sea una
propiedad estructural y no una promesa. Está cubierto por tests.

### Las citas del modelo se verifican

El Gate construye el conjunto de identificadores citables del caso (póliza,
entradas de historial, documentos, códigos de regla) y **descarta** cualquier
referencia del modelo que apunte fuera de ese conjunto. Una alucinación no
llega a la interfaz.

### Los documentos obligatorios los decide la regla

Si el modelo dice «no falta nada» pero la regla exige un informe médico, el
caso queda en `DOCUMENTS_REQUIRED`. Los documentos que el modelo añade por su
cuenta se degradan a `ADVISORY`.

### Doble implementación de persistencia

`CaseRepository` tiene dos implementaciones: `SupabaseCaseRepository` (fuente
de verdad real) e `InMemoryCaseRepository` (desarrollo, tests, demo sin
credenciales). La selección es automática y `GET /api/health` reporta cuál
está activa. Ver DEC-005.

### El timeline es append-only en la base de datos

`case_events` rechaza `UPDATE` y `DELETE` con triggers de PostgreSQL, y el
puerto de persistencia no expone ninguna operación de mutación de eventos. La
inmutabilidad no depende de que nadie se equivoque.

## Modelo de datos

```
hospitals ──┐
patients ───┼──► cases ──┬──► case_events      (append-only, seq por caso)
policies ───┘            ├──► case_evidence
     │                   ├──► notifications
     └── medical_history └──► ai_interactions   (auditoría de IA)
```

`cases.admission` y `cases.current_decision` son `jsonb`: el contrato lo
define TypeScript y se valida con Zod en el borde. Los estados son `enum` de
PostgreSQL, espejo de `case-status.ts`.

## Realtime

`cases` y `case_events` están en la publicación `supabase_realtime`. El
frontend puede suscribirse a los `INSERT` de `case_events` filtrando por
`case_id` y renderizar el timeline conforme ocurre, sin polling.

Si Supabase no está configurado, el frontend debe caer a polling de
`GET /api/cases/:id/events`. Ambos caminos devuelven la misma forma de datos.

## Manejo de fallos

| Fallo | Comportamiento |
|---|---|
| Gemini timeout / rate limit / 5xx | Se registra en `ai_interactions`, se emite `AI_ANALYSIS_FAILED`, el caso se decide con reglas. |
| Gemini devuelve JSON inválido | Igual que arriba; la validación Zod lo rechaza antes de llegar a ningún consumidor. |
| El SDK lanza excepción | Capturada en `runProvider`; nunca propaga al request. |
| Un canal de notificación falla | `Promise.allSettled`: el otro canal se entrega igual y se emite `NOTIFICATION_FAILED`. |
| Transición de estado inválida | Excepción explícita. Preferimos fallar ruidosamente a corromper el timeline. |
| Supabase no configurado | Repositorio in-memory, advertencia en logs, `/api/health` lo reporta. |

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router) | API routes y UI en un despliegue; Vercel de un clic. |
| Lenguaje | TypeScript estricto | El contrato del agente es un tipo, no una convención. |
| Validación | Zod 4 | Un esquema sirve para el borde HTTP y para la salida del LLM. |
| Base de datos | Supabase / PostgreSQL | Fuente de verdad + Realtime + RLS. |
| IA | Gemini (`@google/genai`), salida estructurada | Detrás de un puerto (DEC-003). |
| Tests | Vitest | Rápido, sin configuración, mismo alias de módulos. |
| Despliegue | Vercel | Entregable #2 del reto es un enlace en ejecución. |
