# SCAYL Pulse

### Expediente vivo de emergencia — alerta temprana de ingresos hospitalarios

**hackIAthon Panamá · reto clasificatorio: Sistema de Alerta Temprana de Ingresos a Emergencias**

---

## ¿Qué es SCAYL Pulse?

Cuando un asegurado entra a una sala de emergencias, SCAYL Pulse abre un
**expediente vivo**: valida la póliza, revisa el historial y las
preexistencias, analiza la evidencia documental con IA, aplica un **Safety
Gate determinístico** y notifica **al mismo tiempo** al departamento de
admisiones del hospital y al gestor de casos de la aseguradora.

Y no se detiene ahí. **El caso sigue vivo.** Cuando llega un informe médico,
un documento o cualquier evidencia nueva, el expediente se reevalúa solo —y
todas las decisiones anteriores permanecen en un timeline auditable.

---

## El problema

Hoy, cuando alguien ingresa a emergencias:

- **El hospital** no sabe si la póliza cubre el ingreso. Admite igual —debe
  hacerlo— y descubre el problema administrativo días después, cuando ya es
  una disputa de facturación.
- **La aseguradora** se entera tarde. Cuando le llega el expediente, el caso
  ya escaló en costo y nadie puede reconstruir qué se sabía en qué momento.

El resultado son semanas de ida y vuelta, reclamos rechazados a posteriori y
pacientes atrapados en medio de un problema que no es suyo.

## La solución

```
Ingreso (webhook)
   ↓
Identificación del asegurado
   ↓
Validación de póliza          ← reglas determinísticas
   ↓
Historial y preexistencias    ← tabla clínica declarada, no inferencia del modelo
   ↓
Análisis de evidencia con IA  ← Gemini, salida estructurada y validada
   ↓
SAFETY GATE determinístico    ← puede endurecer, nunca ampliar
   ↓
Clasificación del caso
   ↓
Hospital + aseguradora, simultáneamente
   ↓
Timeline auditable (append-only)
```

Cuando llega evidencia nueva:

```
NEW_EVIDENCE → REASSESSING → análisis → Safety Gate → DECISIÓN ACTUALIZADA
```

La decisión anterior no se borra. Se **superpone**. Un auditor puede abrir el
caso seis meses después y ver, evento por evento, qué se sabía, cuándo, qué
decidió el sistema y por qué cambió.

---

## ¿Por qué no es solo un chatbot?

**Nadie le pregunta nada.** No hay caja de texto. El sistema reacciona a un
evento real del hospital.

**El modelo no decide.** Propone. Un Safety Gate determinístico toma el
resultado más restrictivo entre lo que dicen las reglas y lo que propone el
modelo. El LLM **solo puede endurecer un caso, nunca ampliarlo** — y eso está
cubierto por tests con un modelo adversario que insiste en aprobarlo todo.

**No alucina evidencia.** Las citas del modelo se verifican contra los
registros reales del caso. Una referencia a una póliza o a un antecedente que
no existe se descarta antes de llegar a la interfaz.

**Tiene memoria y responsabilidad.** El expediente evoluciona, y cada decisión
queda registrada con su motivo, su evidencia y sus reglas aplicadas, en una
tabla que la base de datos **impide** modificar o borrar.

---

## Cómo probarlo

```bash
git clone https://github.com/Silentarcherjr/scayl-pulse.git
cd scayl-pulse
npm install
npm run dev          # http://localhost:3000
```

**No hace falta ninguna credencial.** Sin Supabase usa un repositorio en
memoria; sin `GEMINI_API_KEY` usa un analizador determinístico que **se
identifica como tal** y nunca se disfraza de Gemini. `GET /api/health` reporta
exactamente qué está activo en cada momento.

Pulsa cualquiera de los escenarios en la página principal, o:

```bash
curl -s -X POST localhost:3000/api/demo/scenarios/red-human-review/run \
  -H 'content-type: application/json' -d '{"applyFollowUps":true}' | jq
```

---

## Los tres escenarios

### 🟢 GREEN → `VERIFIED`
Póliza vigente, hospital en red, documentación completa, sin antecedentes
relacionados. El caso se verifica solo y ambas partes quedan notificadas en
segundos.

### 🟡 YELLOW → `DOCUMENTS_REQUIRED`
Póliza vigente y cobertura potencialmente válida, pero el costo estimado y el
nivel de triaje exigen documentos que el hospital no envió.

El agente **no dice «falta documentación»**. Dice:

> `MEDICAL_REPORT` — obligatorio: el costo estimado (B/. 6 800) supera el
> umbral de B/. 5 000 y exige informe médico.
> `COST_ESTIMATE` — obligatorio: los casos por encima de B/. 5 000 requieren
> estimado de costos para autorización.

Adjunta los documentos y el caso se reevalúa solo hasta `VERIFIED`.

### 🔴 RED → `HUMAN_REVIEW`
Póliza vigente, documentación completa. Pero existe un antecedente de
hipertensión diagnosticado **330 días antes** de que empezara la póliza, y la
tabla clínica declara que puede relacionarse con el dolor torácico del
ingreso. Ningún documento del expediente lo aclara.

**El sistema no decide.** Escala a una persona mostrando evidencia, motivo,
incertidumbre y acción recomendada — y dejando claro que la atención de
emergencia no se detiene por esta revisión.

Cuando cardiología aporta el informe que documenta el antecedente, el caso
pasa a `VERIFIED` **con la decisión anterior todavía visible en el timeline**.

> Detalle completo y guion de demostración: [`docs/DEMO_SCENARIOS.md`](docs/DEMO_SCENARIOS.md)

---

## Seguridad y human-in-the-loop

SCAYL Pulse **no emite diagnósticos**, **no toma decisiones médicas** y
**no puede impedir la atención de emergencia**. Cada notificación que sale del
sistema lleva esa frase escrita.

Cuando hay incertidumbre relevante, decide una persona:

| Situación | Resultado forzado |
|---|---|
| Póliza vencida | **nunca** `VERIFIED` |
| Documento obligatorio ausente | `DOCUMENTS_REQUIRED` |
| Preexistencia potencial + evidencia insuficiente | `HUMAN_REVIEW` |
| Confianza del modelo bajo el umbral (0.7) | `HUMAN_REVIEW` |
| Hospital fuera de red o desconocido | `HUMAN_REVIEW` |

**Todos los datos del repositorio son sintéticos.** Nunca información médica
real.

---

## Arquitectura

```
src/core/domain/        Estados, tipos, esquemas Zod       ← fuente única de verdad
src/core/policy/        Validación de póliza y documentos  ← determinístico
src/core/history/       Preexistencias                     ← determinístico
src/core/ai/            Puerto de proveedor + Gemini       ← intercambiable
src/core/safety/        SAFETY GATE                        ← las reglas mandan
src/core/orchestrator/  Pipeline del expediente vivo
src/core/repository/    Supabase + in-memory
src/app/api/            Contratos HTTP
supabase/migrations/    Esquema, RLS, timeline append-only
```

Detalle: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Contrato de API: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)

---

## Stack

**Next.js 16** · **TypeScript** · **Supabase / PostgreSQL** (fuente de verdad
+ Realtime) · **Gemini** con salida estructurada, detrás de un puerto ·
**Zod** para validar tanto el borde HTTP como la salida del modelo ·
**Vitest** · **Vercel**.

---

## Configuración local

```bash
cp .env.example .env.local
```

Todo es opcional. Con las variables vacías la aplicación funciona y la demo
completa es reproducible.

| Variable | Para qué | Sin ella |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + claves | Persistencia y Realtime | Repositorio en memoria |
| `GEMINI_API_KEY` | Analizador documental | Analizador determinístico, marcado como tal |
| `ADMISSION_WEBHOOK_SECRET` | Autenticación del webhook | El webhook queda abierto (modo demo) |

Con Supabase local (requiere Docker):
```bash
npx supabase start
npm run db:reset      # migrations + seeds sintéticos
```

---

## Tests

```bash
npm test          # 42 tests
npm run verify    # typecheck + lint + tests
```

Los tests nunca llaman a una API de pago y son reproducibles sin credenciales.
Cubren, entre otras garantías:

- una póliza vencida **nunca** alcanza `VERIFIED`, ni aunque el modelo lo pida;
- **el LLM no puede saltarse el Safety Gate** (cuatro tests con un modelo adversario);
- una respuesta malformada, un timeout o una excepción del SDK **no rompen el caso**;
- los tres escenarios obligatorios siguen siendo reproducibles **con la IA caída**;
- la nueva evidencia dispara reevaluación y **el timeline conserva las decisiones anteriores**;
- **los casos no filtran datos entre sí**;
- los case events son **inmutables**.

Detalle: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)

---

## Equipo

| | Workstream | Rama |
|---|---|---|
| **Anthony Morell** | A — Backend core, arquitectura, Safety Gate | `anthony/backend-core` |
| **Carlos** | B — Frontend, dashboards, timeline, UX | `workstream/frontend` |
| **Sebastián** | C — Integraciones, demo, QA, dataset | `workstream/integrations` |

Herramientas de IA usadas y su validación humana:
[`docs/AI_USAGE_LOG.md`](docs/AI_USAGE_LOG.md)

**¿Te acabas de unir al proyecto?** → [`docs/TEAM_START.md`](docs/TEAM_START.md)
