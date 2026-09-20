# AGENTS.md — instrucciones para agentes de código

Este archivo es la instrucción global para cualquier agente (Codex, Claude
Code u otro) que trabaje en **SCAYL Pulse**.

Si eres un agente y estás leyendo esto: **sigue este procedimiento al pie de
la letra antes de escribir una sola línea de código.**

---

## 0. Qué es este proyecto (en diez líneas)

SCAYL Pulse es un **sistema de alerta temprana de ingresos a emergencias**
para el hackIAthon Panamá. Cuando un hospital registra un ingreso, un webhook
dispara un agente que valida la póliza, revisa el historial y las
preexistencias, analiza la evidencia con IA, aplica un **Safety Gate
determinístico** y notifica **simultáneamente** al hospital y a la aseguradora.

Lo diferencial es el **expediente vivo**: el caso no termina con la primera
evaluación. Cuando llega nueva evidencia, se reevalúa solo y **todas las
decisiones anteriores permanecen en el timeline**.

El sistema **no diagnostica, no decide medicina y no puede impedir la atención
de emergencia**. Las reglas determinísticas prevalecen siempre sobre el LLM.

---

## 1. Procedimiento obligatorio al empezar una sesión

Ejecuta estos pasos **en orden**. No te saltes ninguno.

### Paso 1 — Lee la documentación base
```
docs/PROJECT_SPEC.md      ← qué construimos y por qué
docs/ARCHITECTURE.md      ← cómo está montado
docs/HACKATHON_RULES.md   ← qué exige la organización y cuál es el deadline
```

### Paso 2 — Averigua en qué rama estás
```bash
git branch --show-current
```
**Esto determina tu workstream.** Ver § 2.

### Paso 3 — Lee el estado actual
```
docs/STATUS.md            ← qué está hecho, en curso, bloqueado
docs/HANDOFF.md           ← dónde se quedó la última sesión
```

### Paso 4 — Lee lo específico de tu workstream
```
docs/WORKSTREAMS.md       ← qué carpetas son tuyas y cuáles NO
docs/API_CONTRACT.md      ← el contrato (obligatorio para B y C)
```

### Paso 5 — Comprueba que el repositorio está sano
```bash
npm install
npm run verify            # typecheck + lint + tests
```
Si `verify` falla **antes** de que toques nada, **no lo arregles en silencio**:
anótalo en `docs/HANDOFF.md` y avisa. Puede ser trabajo en curso de otro
workstream.

### Paso 6 — Trabaja, **solo dentro de tu área**

### Paso 7 — Antes de cerrar
```bash
npm run verify
```
Luego, en este orden:
1. actualiza `docs/STATUS.md` (tu sección);
2. actualiza `docs/HANDOFF.md` (tu sección);
3. añade una entrada a `docs/AI_USAGE_LOG.md` con lo que hiciste y qué validó un humano;
4. commit con mensaje claro;
5. `git push origin <tu-rama>`.

---

## 2. Detección de rama → workstream

**Mira la rama actual y asume el rol correspondiente. Sin preguntar.**

| Si la rama es… | Eres… | Lee también |
|---|---|---|
| `anthony/backend-core` | **Workstream A — Backend Core** | `CLAUDE.md`, `docs/TEST_PLAN.md` |
| `workstream/frontend` | **Workstream B — Frontend** | `docs/API_CONTRACT.md`, `docs/DEMO_SCENARIOS.md` |
| `workstream/integrations` | **Workstream C — Integrations / Demo / QA** | `docs/DEMO_SCENARIOS.md`, `docs/TEST_PLAN.md` |
| `main` | **ninguno** | ⚠️ No trabajes en `main`. Cambia a tu rama primero. |
| otra cosa | pregunta | No asumas. |

---

### 🅰 Workstream A — Backend Core · `anthony/backend-core`

**Responsable:** Anthony + Claude Code.

**Tuyo:** arquitectura · Supabase y migrations · API · Case Orchestrator ·
integración Gemini · Safety Gate · case events · reevaluación · tests de
backend · contratos de API.

**Reglas propias:**
- Cualquier cambio de contrato se refleja en `docs/API_CONTRACT.md` **en el
  mismo commit**.
- Cualquier decisión arquitectónica va a `docs/DECISIONS.md`.
- Un estado de caso nuevo exige justificación escrita. No los inventes.

---

### 🅱 Workstream B — Frontend · `workstream/frontend`

**Responsable:** compañero + Codex.

**Tuyo:** dashboard · visualización de casos · simulador de ingreso · timeline ·
estados · evidencia · experiencia hospital · experiencia aseguradora ·
visualización realtime · UX responsive · manejo correcto de errores.

**NO modifiques:** `src/core/**`, `supabase/migrations/**`, el Safety Gate ni
los contratos de API.

**Cómo trabajar sin depender del backend:**
1. `docs/API_CONTRACT.md` tiene todas las formas de respuesta con ejemplos.
2. El backend ya corre: `npm run dev`, y `POST /api/demo/scenarios/:id/run`
   te crea casos reales de los tres tipos.
3. Importa los tipos, no los reescribas:
   ```ts
   import { CASE_STATUS_LABELS, type CaseStatus } from '@/core/domain/case-status';
   import type { AgentDecision, CaseEvent } from '@/core/domain/types';
   ```

**Lo que la interfaz tiene que dejar claro (esto es el producto):**
- El **timeline** del expediente vivo: es lo que nos diferencia de un chatbot.
  Ordena por `seq`, **nunca** por `createdAt`.
- Cuando `gateOverrode === true`, **enséñalo**: el Safety Gate corrigió al
  modelo. Es el momento más demostrativo que tenemos.
- Distingue visualmente `BLOCKING` de `ADVISORY` en los documentos faltantes.
- Si `source === 'AI_UNAVAILABLE'`, dilo. Nunca presentes una decisión de
  reglas como si viniera del modelo.
- En `HUMAN_REVIEW`, muestra evidencia, motivo, incertidumbre y acción
  recomendada — y que la atención de emergencia no se detiene.
- `decision.reason` es multilínea: renderiza con `white-space: pre-line`.

**Realtime:** `getSupabaseBrowserClient()` en
`src/lib/supabase/browser-client.ts` devuelve `null` si Supabase no está
configurado. En ese caso cae a polling de `GET /api/cases/:id/events`. **Las
dos rutas deben funcionar**, porque no sabemos si habrá credenciales en la
demo.

---

### 🅲 Workstream C — Integrations / Demo / QA · `workstream/integrations`

**Responsable:** compañero + Codex.

**Tuyo:** dataset sintético · fixtures GREEN/YELLOW/RED · escenarios
adicionales útiles · simulación del hospital · sistema de notificaciones ·
seeds · validación de flujos · QA end-to-end · documentación de demo · pruebas
de integración.

**NO modifiques** la arquitectura principal sin aprobación: `src/core/safety/`,
`src/core/orchestrator/`, `src/core/domain/`.

**Tus archivos:** `src/data/synthetic/`, `src/core/demo/`,
`src/core/notifications/`, `supabase/seed.sql`, `docs/DEMO_SCENARIOS.md`,
`tests/e2e/` y `tests/qa/` (por crear).

**Reglas propias:**
- **Solo datos sintéticos.** Nunca información médica real. Correos en
  `.example`. Nombres marcados como `(sintético)`.
- Un escenario nuevo debe tener `expectedStatus` y un test que lo verifique.
  Un escenario sin test no es un escenario, es una anécdota.
- Si añades datos a `src/data/synthetic/reference-data.ts`, refleja el mismo
  cambio en `supabase/seed.sql`. Las dos fuentes deben coincidir.
- Las fechas se calculan relativas a hoy. **Nunca hardcodees una fecha
  absoluta en una fixture**: caduca y rompe la demo en el peor momento.

---

## 3. Reglas que aplican a todos los agentes

### Seguridad del producto — no negociable
1. El sistema **no emite diagnósticos** ni decisiones clínicas.
2. **No puede impedir la atención de emergencia.** Toda notificación lo dice.
3. **No inventa** diagnósticos, antecedentes, cláusulas, pólizas ni evidencia.
4. **Las reglas determinísticas prevalecen sobre el LLM.** Siempre.
5. Ante incertidumbre relevante → `HUMAN_REVIEW`.
6. La salida del LLM **nunca** llega al frontend sin validar con Zod.

### Datos y secretos
7. **Solo datos sintéticos** (DEC-002).
8. **Ningún secreto en Git.** Si necesitas una clave, usa `.env.local` y
   documenta la variable en `.env.example` con el valor vacío.
9. Si encuentras un secreto commiteado, **detente y avisa**. No lo borres con
   un force push.

### Git
10. **Nunca `git push --force`.** Nunca `git rebase` de una rama compartida.
    Nunca `git reset --hard` sobre trabajo ajeno.
11. Commits pequeños y descriptivos, con prefijo: `feat:` `fix:` `docs:`
    `test:` `chore:` `refactor:` `cross:`.
12. Trabaja en tu rama. `main` se mantiene estable.
13. Trae `main` antes de empezar: `git fetch origin && git merge origin/main`.

### Alcance
14. **¿Se te ocurre una idea de producto nueva? NO la implementes.**
    Regístrala en `docs/IDEAS.md` con estado `PROPOSED`. Solo una persona
    puede cambiarla a `APPROVED`. Un agente jamás aprueba su propia idea.
15. Bugs, tests, refactors y optimización normal **no** van a `IDEAS.md`: son
    trabajo ordinario, hazlos y anótalos en `STATUS.md`.
16. No construyas funcionalidades porque «serían cool». Prioridad:
    **que funcione → que se entienda → que sorprenda → que se pueda demostrar
    → que sea seguro → que esté documentado → extras.**

### Calidad
17. `npm run verify` tiene que pasar antes de cada push.
18. Un test que falla no se borra ni se marca `skip` para «desbloquear». Se
    arregla, o se documenta en `HANDOFF.md` por qué no se pudo.
19. No reformatees archivos que no son tuyos. Un formateo global destruye el
    trabajo de los otros en el merge.

---

## 4. Si necesitas tocar algo que no es tuyo

Pasa. Un contrato puede estar mal o faltar un campo. **El problema no es
tocarlo: es tocarlo en silencio.**

1. Comprueba en `docs/WORKSTREAMS.md` de quién es el archivo.
2. Anótalo en `docs/HANDOFF.md`, sección **Cambios transversales**:
   qué archivo, de quién es, qué cambiaste y por qué era necesario.
3. Haz el cambio **mínimo** que resuelve el problema. No aproveches para
   refactorizar de paso.
4. Commitéalo **por separado**, con prefijo `cross:`, para que sea trivial de
   revisar o revertir.
5. Si es un cambio de contrato de API, actualiza `docs/API_CONTRACT.md` en ese
   mismo commit.

---

## 5. Plantillas

### `docs/STATUS.md` — tu sección
```markdown
### Workstream X — <rama>
**Última actualización:** AAAA-MM-DD HH:MM

**Completed**
- …

**In Progress**
- …

**Next**
- …

**Blocked**
- … (qué te bloquea y quién puede desbloquearlo)

**Tests:** N passing / M failing
```

### `docs/HANDOFF.md` — tu sección
```markdown
### Workstream X — <rama>
**Fecha:** AAAA-MM-DD
**Último commit:** <sha corto> — <mensaje>

**Qué funciona:** …
**Qué falta:** …
**Archivos modificados:** …
**Próximo paso exacto:** … (una acción concreta, no "seguir con el frontend")
**Tests passing:** N
**Tests failing:** N — cuáles y por qué
**Bugs conocidos:** …
**Riesgos:** …
```

---

## 6. Órdenes rápidas

```bash
npm run dev            # http://localhost:3000
npm run verify         # typecheck + lint + tests  ← antes de cada push
npm test               # solo tests
npm run test:watch     # tests en modo watch
npx supabase start     # Postgres local (si tienes Docker)
npm run db:reset       # aplica migrations + seed en local
```

Crear casos reales de prueba sin tocar la interfaz:
```bash
curl -s -X POST localhost:3000/api/demo/scenarios/green-verified/run  -H 'content-type: application/json' -d '{}' | jq
curl -s -X POST localhost:3000/api/demo/scenarios/yellow-documents-required/run -H 'content-type: application/json' -d '{"applyFollowUps":true}' | jq
curl -s -X POST localhost:3000/api/demo/scenarios/red-human-review/run -H 'content-type: application/json' -d '{"applyFollowUps":true}' | jq
```

---

## 7. Si algo no está claro

En este orden: `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` →
`docs/API_CONTRACT.md` → el código (`src/core/` está comentado donde importa).

Si sigue sin estar claro: **no lo adivines**. Anótalo en `docs/HANDOFF.md`
como pregunta abierta y sigue con lo que sí puedas hacer. Una suposición
silenciosa sobre un contrato es lo que hace que dos workstreams no encajen el
último día.
