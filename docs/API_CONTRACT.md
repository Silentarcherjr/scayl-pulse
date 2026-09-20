# Contrato de API

**Este documento es el contrato.** El frontend (Workstream B) y las
integraciones (Workstream C) pueden trabajar contra él sin preguntarle nada al
backend.

Si algo aquí no coincide con el código, **es un bug del backend** y hay que
reportarlo en [`HANDOFF.md`](HANDOFF.md). Un cambio de contrato se documenta
aquí en el **mismo commit** que lo introduce.

Base URL local: `http://localhost:3000`

---

## Envelope de respuesta

Todas las rutas devuelven la misma forma.

**Éxito**
```json
{ "ok": true, "data": { } }
```

**Error**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Case … not found", "details": null } }
```

| `code` | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 422 | El cuerpo no cumple el esquema. `details` trae los issues de Zod. |
| `NOT_FOUND` | 404 | El caso o el escenario no existe. |
| `CONFLICT` | 409 | Operación inválida para el estado actual (p. ej. evidencia sobre un caso `RESOLVED`). |
| `UNAUTHORIZED` | 401 | Falta o no coincide `x-scayl-webhook-secret`. |
| `CAPACITY_REACHED` | 429 | La instancia alcanzó su tope de casos almacenados. `details` trae `{ current, limit }`. |
| `INTERNAL_ERROR` | 500 | Error inesperado. Nunca filtra stack traces. |

---

## Tipos compartidos

Importables desde el frontend:

```ts
import type { CaseStatus } from '@/core/domain/case-status';
import { CASE_STATUS_LABELS, CASE_STATUSES } from '@/core/domain/case-status';
import type { AgentDecision, CaseEvent, CaseEvidence, Notification } from '@/core/domain/types';
```

### `CaseStatus`
`ADMITTED` · `CHECKING` · `VERIFIED` · `DOCUMENTS_REQUIRED` · `HUMAN_REVIEW` · `REASSESSING` · `RESOLVED`

`CASE_STATUS_LABELS` trae la etiqueta en español para cada uno. **Úsala en
lugar de escribir las etiquetas a mano.**

### `AgentDecision`

```ts
{
  status: 'VERIFIED' | 'DOCUMENTS_REQUIRED' | 'HUMAN_REVIEW';
  confidence: number;              // 0..1 — solidez documental, NO juicio clínico
  summary: string;                 // una o dos frases para la cabecera
  reason: string;                  // multilínea, con viñetas "• [CODE] mensaje"
  evidence: Array<{
    sourceType: 'POLICY' | 'MEDICAL_HISTORY' | 'ADMISSION' | 'DOCUMENT' | 'RULE';
    sourceId: string;
    excerpt: string;
  }>;
  missingDocuments: Array<{
    documentType: DocumentType;
    reason: string;
    severity: 'BLOCKING' | 'ADVISORY';
  }>;
  recommendedAction: string;
  requiresHuman: boolean;
  generatedAt: string;             // ISO 8601
  source: 'DETERMINISTIC' | 'AI_ASSISTED' | 'AI_UNAVAILABLE';
  appliedRules: string[];          // p. ej. ["POLICY_EXPIRED"]
  gateOverrode: boolean;           // el Safety Gate corrigió al modelo
  modelSuggestedStatus: 'VERIFIED' | 'DOCUMENTS_REQUIRED' | 'HUMAN_REVIEW' | null;
  checks: DecisionCheck[];         // ver abajo — el panel «¿por qué?»
}
```

### `DecisionCheck` — el panel «¿Por qué tomó esta decisión?»

```ts
{
  code: string;        // POLICY_ACTIVE, HOSPITAL_IN_NETWORK, … estable, sirve de clave
  label: string;       // "Póliza vigente en la fecha del ingreso"
  status: 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_EVALUATED';
  detail: string;      // la respuesta concreta para ESTE caso
  evidence?: EvidenceReference;
  imposedFloor?: 'VERIFIED' | 'DOCUMENTS_REQUIRED' | 'HUMAN_REVIEW';
}
```

**Incluye las comprobaciones que pasaron, no solo las que fallaron.** Eso es lo
que convierte la decisión en auditable: un gestor ve de un vistazo qué se
revisó y salió bien, no solo qué falló.

El orden es **estable entre casos**: renderízalo tal cual, sin ordenar. Las
comprobaciones emitidas, en orden:

`PATIENT_IDENTIFIED` · `POLICY_FOUND` · `POLICY_ACTIVE` · `POLICY_OWNERSHIP` ·
`EMERGENCY_COVERAGE` · `WAITING_PERIOD` · `HOSPITAL_IN_NETWORK` ·
`REQUIRED_DOCUMENTS` · `PRE_EXISTING_CONDITIONS` · `EVIDENCE_SUFFICIENCY` ·
`ANALYSIS_CONFIDENCE` · `SAFETY_GATE`

Sugerencia de render: `PASSED` → ✓ · `WARNING` → ⚠ · `FAILED` → ✕ ·
`NOT_EVALUATED` → — (y en gris: significa «no aplica a este caso», no «falló»).

`imposedFloor` dice qué estado forzó esa comprobación: es la respuesta literal
a «¿por qué este caso no está verificado?».

`SAFETY_GATE` es siempre la última y resume el veredicto. Cuando
`gateOverrode` es `true`, su `detail` nombra lo que el modelo propuso y a qué
lo restringieron las reglas.

**Ejemplo (escenario RED):**

```json
[
  { "code": "POLICY_ACTIVE", "label": "Póliza vigente en la fecha del ingreso",
    "status": "PASSED", "detail": "Activa, vigencia 2026-06-22 → 2027-06-22." },
  { "code": "HOSPITAL_IN_NETWORK", "label": "Hospital dentro de red",
    "status": "PASSED", "detail": "Hospital Nacional Metropolitano pertenece a la red." },
  { "code": "PRE_EXISTING_CONDITIONS", "label": "Antecedentes potencialmente relacionados",
    "status": "WARNING", "detail": "1 antecedente anterior a la póliza…" },
  { "code": "EVIDENCE_SUFFICIENCY", "label": "Evidencia suficiente sobre los antecedentes",
    "status": "FAILED", "detail": "Ningún documento del expediente aclara…",
    "imposedFloor": "HUMAN_REVIEW" },
  { "code": "SAFETY_GATE", "label": "Safety Gate", "status": "WARNING",
    "detail": "Se impidió una decisión automática: evidencia suficiente sobre los antecedentes." }
]
```

**Notas de UI importantes**

- `reason` es multilínea (`\n`). Renderízalo con `white-space: pre-line`.
- `severity: 'BLOCKING'` = obligatorio, bloquea la verificación.
  `'ADVISORY'` = recomendado, no bloquea. Distínguelos visualmente.
- Si `gateOverrode === true`, muestra que el Safety Gate corrigió al modelo
  (`modelSuggestedStatus → status`). **Es el momento más demostrativo del
  producto: no lo escondas.**
- `source` distingue tres estados y **no son intercambiables**:
  `AI_ASSISTED` solo cuando un modelo real produjo el análisis;
  `AI_UNAVAILABLE` cuando se intentó y no pudo usarse (timeout, respuesta
  inválida, caída); `DETERMINISTIC` cuando no había proveedor configurado.
  En los dos últimos casos la decisión salió solo de reglas: **nunca la
  presentes como si viniera del modelo.**

### `CaseEvent`

```ts
{
  id: string;
  caseId: string;
  seq: number;                     // monótono por caso, 1..n — clave de orden
  type: CaseEventType;
  actor: 'SYSTEM' | 'HOSPITAL' | 'INSURER' | 'AI_AGENT' | 'SAFETY_GATE' | 'DEMO_RUNNER';
  statusBefore: CaseStatus | null;
  statusAfter: CaseStatus | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
```

`CaseEventType` cubre todo el recorrido que la UI debe poder mostrar:

`ADMISSION_RECEIVED` · `PATIENT_IDENTIFIED` · `PATIENT_NOT_FOUND` ·
`POLICY_RETRIEVED` · `POLICY_VALIDATED` · `HISTORY_RETRIEVED` ·
`AI_ANALYSIS_STARTED` · `AI_ANALYSIS_COMPLETED` · `AI_ANALYSIS_FAILED` ·
`SAFETY_GATE_APPLIED` · `CASE_CLASSIFIED` · `HOSPITAL_NOTIFIED` ·
`INSURER_NOTIFIED` · `NOTIFICATION_FAILED` · `NEW_EVIDENCE_RECEIVED` ·
`REASSESSMENT_STARTED` · `DECISION_UPDATED` · `CASE_SUMMARY_GENERATED` ·
`CASE_RESOLVED`

En `CASE_CLASSIFIED` y `DECISION_UPDATED`, `payload.decision` contiene el
`AgentDecision` completo de ese momento. **Así se reconstruye el historial de
decisiones sin llamadas extra.**

---

## Endpoints

### `POST /api/admissions`
Webhook de ingreso hospitalario. Crea el caso y ejecuta el pipeline completo.

**Headers**
`x-scayl-webhook-secret: <secreto>` — solo si `ADMISSION_WEBHOOK_SECRET` está configurado.

**Body**
```json
{
  "hospitalCode": "HOSP-PTY-01",
  "patientNationalId": "8-888-1111",
  "policyNumber": "POL-1001",
  "admissionReason": "Laceración profunda en antebrazo izquierdo.",
  "admissionReasonCode": "S51.8",
  "triageLevel": "YELLOW",
  "estimatedCost": 950,
  "admittedAt": "2026-09-19T22:10:00.000Z",
  "attachedDocuments": [
    { "documentType": "ADMISSION_FORM", "title": "Formulario de ingreso", "content": "…" }
  ]
}
```

| Campo | Req. | Notas |
|---|---|---|
| `hospitalCode` | ✅ | Debe existir. Si no, `HUMAN_REVIEW`. |
| `patientNationalId` | ✅ | Cédula sintética. |
| `policyNumber` | ⬜ | Si falta, se busca la póliza activa del asegurado. |
| `admissionReason` | ✅ | Texto libre, máx. 1000. |
| `admissionReasonCode` | ⬜ | ICD-10-ish. **Sin él no se evalúa la tabla clínica de preexistencias.** |
| `triageLevel` | ✅ | `RED`\|`ORANGE`\|`YELLOW`\|`GREEN`\|`BLUE` |
| `estimatedCost` | ⬜ | ≥ 5000 activa requisitos documentales extra. |
| `admittedAt` | ⬜ | ISO 8601. Por defecto, ahora. |
| `attachedDocuments` | ⬜ | Máx. 20. Se convierten en evidencia del caso. |

**`201`**
```json
{ "ok": true, "data": { "caseId": "…", "caseNumber": "PULSE-2026-A1B2C3", "status": "VERIFIED", "decision": { } } }
```

**`429`** cuando la instancia alcanzó su tope de casos (`SCAYL_MAX_CASES`,
200 por defecto). Los casos son inmutables y no se purgan solos: para liberar
espacio hay que reiniciar los datos de demo. Consulta `capacity` en
`/api/health` para ver la ocupación actual.

---

### `GET /api/cases/:id`
Detalle completo del caso, para la vista de hospital y la de aseguradora.

**`200`**
```json
{
  "ok": true,
  "data": {
    "case": { "id": "…", "caseNumber": "…", "status": "HUMAN_REVIEW", "admission": { }, "currentDecision": { }, "createdAt": "…", "updatedAt": "…" },
    "hospital": { "code": "HOSP-PTY-01", "name": "…", "networkStatus": "IN_NETWORK", "admissionsContact": "…" },
    "patient": { "id": "…", "fullName": "…", "birthDate": "…" },
    "policy": { "policyNumber": "POL-3003", "status": "ACTIVE", "effectiveFrom": "…", "effectiveTo": "…", "…": "…" },
    "decision": { },
    "resolution": null,
    "evidence": [ ],
    "notifications": [ ],
    "eventCount": 12,
    "decisionHistory": [ { "seq": 9, "at": "…", "type": "CASE_CLASSIFIED", "decision": { } } ],
    "aiInteractions": [ { "provider": "google-gemini", "model": "gemini-2.5-flash", "valid": true, "latencyMs": 812, "error": null } ]
  }
}
```

`decisionHistory` está ordenado del más antiguo al más reciente y **conserva
las decisiones superadas**.

`aiInteractions` nunca incluye el `rawResponse`: es un artefacto interno.

---

### `GET /api/cases/:id/events`
Timeline append-only, ordenado por `seq` ascendente.

```json
{ "ok": true, "data": { "caseId": "…", "status": "VERIFIED", "count": 12, "events": [ ] } }
```

Seguro de consultar en bucle. Alternativa sin polling: Realtime sobre
`case_events` filtrando `case_id=eq.<id>`.

---

### `POST /api/cases/:id/evidence`
Aporta evidencia nueva a un caso vivo. Dispara `REASSESSING` y reejecuta el
pipeline completo.

**Body**
```json
{
  "documentType": "MEDICAL_REPORT",
  "title": "Informe médico de emergencias",
  "content": "…",
  "submittedBy": "hospital:HOSP-PTY-02",
  "metadata": { "addressesConditionCodes": ["I10"] }
}
```

`metadata.addressesConditionCodes` es el mecanismo explícito para declarar que
un documento aclara un antecedente concreto. También se detecta por el texto
(sin distinguir acentos), pero declararlo es más fiable.

**`201`** — misma forma que `/api/admissions`.
**`409`** si el caso está `RESOLVED` o hay una evaluación en curso.

---

### `POST /api/cases/:id/resolve`
Cierra el caso. **Es la única decisión del sistema que toma una persona.**

```json
{
  "outcome": "COVERAGE_CONFIRMED",
  "resolvedBy": "Gestora de casos: L. Ramírez",
  "reason": "Cobertura verificada y confirmada tras revisar el expediente.",
  "notes": "Opcional."
}
```

| Campo | Req. | Notas |
|---|---|---|
| `outcome` | ✅ | `COVERAGE_CONFIRMED` \| `COVERAGE_DENIED` \| `CANCELLED` |
| `resolvedBy` | ✅ | Quién cierra. **Sin valor por defecto**: un cierre anónimo no es un cierre. |
| `reason` | ✅ | Mínimo 10 caracteres. |
| `notes` | ⬜ | |

**`200`**
```json
{ "ok": true, "data": { "caseId": "…", "status": "RESOLVED", "resolution": {
  "outcome": "COVERAGE_CONFIRMED",
  "resolvedBy": "…", "reason": "…",
  "statusAtResolution": "HUMAN_REVIEW",
  "overrodeSystemRecommendation": true,
  "resolvedAt": "…"
} } }
```

`overrodeSystemRecommendation` es `true` cuando una persona confirma la
cobertura de un caso que el sistema **no** había verificado. Es legítimo, pero
**muéstralo de forma destacada**: es lo primero que un auditor busca.

**`409`** si el caso ya está cerrado o si hay una evaluación en curso
(`CHECKING`, `REASSESSING`). **El cierre es terminal:** un caso `RESOLVED` no
se reabre y rechaza evidencia nueva (DEC-011).

Notas de UI: pide `resolvedBy` y `reason` en el formulario, no los rellenes
por defecto. Ambos van al timeline y a la notificación que reciben hospital y
aseguradora.

---

### `GET /api/cases/:id/summary`
Resumen narrativo escrito para un **gestor de casos** que abre el expediente.

```json
{ "ok": true, "data": { "caseId": "…", "caseNumber": "…", "status": "HUMAN_REVIEW", "summary": {
  "headline": "…",
  "whatHappened": "…",
  "whatChanged": "…"  ,
  "whatIsNeeded": "…",
  "keyPoints": ["…"],
  "source": "AI_ASSISTED" ,
  "model": "gemini-2.5-flash",
  "generatedAt": "…",
  "decisionGeneratedAt": "…"
} } }
```

**Se genera bajo demanda, no durante el ingreso.** El hospital espera la
respuesta de `/api/admissions`; una segunda llamada al modelo ahí duplicaría
su latencia por una narrativa que nadie está leyendo todavía. Aquí, en cambio,
quien espera es una persona que acaba de abrir el caso.

**Está cacheado.** El resultado se guarda como evento del timeline y se
reutiliza mientras la decisión no cambie, así que reabrir un caso no cuesta
nada. `?refresh=true` fuerza una regeneración.

**Nunca cambia la decisión.** Se produce después del Safety Gate y recibe la
decisión final como entrada: puede explicarla, nunca contradecirla.

- `whatChanged` es `null` en la primera evaluación; con reevaluaciones cuenta
  qué evidencia llegó y qué cambió.
- `source` sigue la misma convención que en `AgentDecision`: `AI_ASSISTED`
  solo si un modelo real lo escribió. **Si es `DETERMINISTIC` o
  `AI_UNAVAILABLE`, el texto lo compuso el sistema a partir del expediente —
  no lo presentes como generado por IA.**

Notas de UI: llámalo desde un botón explícito, no al cargar la página. La
primera generación puede tardar más de 10 s.

---

### `GET /api/cases?limit=50`
Índice para los dashboards. `limit` entre 1 y 200.

```json
{ "ok": true, "data": { "count": 3, "cases": [ { "id": "…", "caseNumber": "…", "status": "…", "decisionStatus": "…", "requiresHuman": true, "hospitalCode": "…", "admissionReason": "…", "triageLevel": "…", "scenarioId": "…", "createdAt": "…", "updatedAt": "…" } ] } }
```

---

### `GET /api/demo/scenarios`
Catálogo de escenarios reproducibles. Alimenta el simulador de ingresos.

```json
{ "ok": true, "data": { "scenarios": [ {
  "id": "red-human-review", "code": "RED", "title": "…", "narrative": "…",
  "expectedStatus": "HUMAN_REVIEW", "expectedRequiresHuman": true,
  "admissionSummary": { }, "followUps": [ { "id": "…", "label": "Adjuntar informe de cardiología", "expectedStatusAfter": "VERIFIED" } ]
} ] } }
```

---

### `POST /api/demo/scenarios/:id/run`
Ejecuta un escenario **a través del pipeline real**. No es un mock.

**Body** (opcional)
```json
{ "applyFollowUps": false }
```

Con `applyFollowUps: true` también envía la evidencia de seguimiento, de modo
que el flujo completo de reevaluación se demuestra en un clic.

**`201`**
```json
{ "ok": true, "data": {
  "scenarioId": "red-human-review", "code": "RED",
  "caseId": "…", "caseNumber": "…",
  "finalStatus": "VERIFIED", "expectedStatus": "VERIFIED", "matchedExpectation": true,
  "steps": [ { "label": "Ingreso inicial", "status": "HUMAN_REVIEW", "expectedStatus": "HUMAN_REVIEW", "matchedExpectation": true, "decision": { } } ],
  "case": { }
} }
```

`matchedExpectation` permite al frontend mostrar en verde que el sistema hizo
exactamente lo prometido. Es una señal fuerte para el jurado.

También responde **`429`** al alcanzarse el tope de casos. El endpoint es
público y escribe en la base: el tope es lo que impide que alguien —o un
script con un bucle mal escrito— infle la base sin límite.

---

### `GET /api/health`
Qué está realmente conectado ahora mismo.

```json
{ "ok": true, "data": {
  "service": "scayl-pulse", "status": "up",
  "repository": "supabase", "persistence": "supabase", "persistenceNote": null,
  "realtimeAvailable": true,
  "aiProvider": "deterministic-fixture", "geminiModel": null,
  "env": { "present": { "SUPABASE_SERVICE_ROLE_KEY": true, "GEMINI_API_KEY": false }, "unrecognizedNames": [] },
  "capacity": { "storedCases": 7, "maxCases": 200 },
  "checkedAt": "…"
} }
```

`persistenceNote` explica por qué se está usando el repositorio en memoria
cuando `persistence` no es `supabase`. `env.present` dice qué variables ve la
aplicación **por nombre, nunca por valor**, y `env.unrecognizedNames` lista
variables de esta familia que nada lee — así un nombre mal escrito deja de
fallar en silencio.

Útil para que la UI muestre un banner honesto de «modo demo sin IA».

---

## Ejemplos ejecutables

```bash
curl -s localhost:3000/api/health | jq
```

```bash
curl -s -X POST localhost:3000/api/demo/scenarios/red-human-review/run \
  -H 'content-type: application/json' \
  -d '{"applyFollowUps":true}' | jq '.data.steps[] | {label, status, matchedExpectation}'
```

```bash
CASE=$(curl -s -X POST localhost:3000/api/demo/scenarios/yellow-documents-required/run \
  -H 'content-type: application/json' -d '{}' | jq -r .data.caseId)

curl -s -X POST "localhost:3000/api/cases/$CASE/evidence" \
  -H 'content-type: application/json' \
  -d '{"documentType":"MEDICAL_REPORT","title":"Informe","content":"Apendicitis aguda no complicada.","submittedBy":"qa"}' | jq .data.status

curl -s "localhost:3000/api/cases/$CASE/events" | jq '.data.events[] | {seq, type, message}'
```
