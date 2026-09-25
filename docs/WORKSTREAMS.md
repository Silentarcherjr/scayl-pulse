# Workstreams y propiedad de carpetas

Tres agentes trabajan en paralelo. Esta página existe para que **no se pisen**.

| Workstream | Rama | Responsable | Ámbito |
|---|---|---|---|
| **A — Backend Core** | `anthony/backend-core` | Anthony + Claude Code | Arquitectura, Supabase, API, orquestador, Gemini, Safety Gate, tests |
| **B — Frontend** | `workstream/frontend` | Compañero + Codex | Dashboards, timeline, simulador, UX hospital y aseguradora |
| **C — Integrations / Demo / QA** | `workstream/integrations` | Compañero + Codex | Dataset, escenarios, notificaciones, seeds, QA end-to-end |

> Asignación sugerida: **Carlos González → Workstream B**, **Sebastián Sánchez → Workstream C**.
> Es una sugerencia, no una restricción: lo que manda es la rama en la que
> cada uno trabaje. Si la intercambian, no hay que cambiar nada en el repo.

---

## Propiedad de carpetas (OWNERSHIP)

`✅ propietario` · `👀 solo lectura` · `⚠️ requiere acuerdo documentado`

| Ruta | A (backend) | B (frontend) | C (integrations) |
|---|:--:|:--:|:--:|
| `src/core/domain/` | ✅ | 👀 | 👀 |
| `src/core/safety/` | ✅ | 👀 | 👀 |
| `src/core/orchestrator/` | ✅ | 👀 | 👀 |
| `src/core/policy/`, `src/core/history/` | ✅ | 👀 | ⚠️ |
| `src/core/ai/` | ✅ | 👀 | 👀 |
| `src/core/repository/` | ✅ | 👀 | 👀 |
| `src/core/notifications/` | ⚠️ | 👀 | ✅ |
| `src/core/demo/` | ⚠️ | 👀 | ✅ |
| `src/app/api/` | ✅ | 👀 | ⚠️ |
| `src/app/**` (páginas, layout, componentes) | 👀 | ✅ | 👀 |
| `src/components/`, `src/hooks/`, `src/styles/` (por crear) | 👀 | ✅ | 👀 |
| `src/lib/supabase/browser-client.ts` | ⚠️ | ✅ | 👀 |
| `src/lib/` (resto) | ✅ | 👀 | 👀 |
| `src/data/synthetic/` | ⚠️ | 👀 | ✅ |
| `supabase/migrations/` | ✅ | 👀 | ⚠️ |
| `supabase/seed.sql` | ⚠️ | 👀 | ✅ |
| `tests/` (core) | ✅ | 👀 | ⚠️ |
| `tests/e2e/`, `tests/qa/` (por crear) | 👀 | ⚠️ | ✅ |
| `docs/API_CONTRACT.md`, `ARCHITECTURE.md`, `DECISIONS.md` | ✅ | 👀 | 👀 |
| `docs/DEMO_SCENARIOS.md`, `TEST_PLAN.md` | ⚠️ | 👀 | ✅ |
| `docs/STATUS.md`, `HANDOFF.md`, `AI_USAGE_LOG.md`, `IDEAS.md` | ✅ escribe | ✅ escribe | ✅ escribe |

`docs/STATUS.md`, `HANDOFF.md`, `AI_USAGE_LOG.md` e `IDEAS.md` los escriben
los tres, **cada uno en su propia sección**, para evitar conflictos de merge.

---

## Responsabilidades

### Workstream A — Backend Core
Arquitectura · Supabase y migrations · API y contratos · Case Orchestrator ·
integración Gemini · Safety Gate · case events · reevaluación · tests de
backend.

### Workstream B — Frontend
Dashboard · visualización de casos · simulador de ingreso · timeline · estados ·
evidencia · experiencia hospital · experiencia aseguradora · visualización
realtime · UX responsive · manejo correcto de errores.

**No modificar:** backend core, migrations, Safety Gate, contratos de API.

### Workstream C — Integrations / Demo / QA
Dataset sintético · fixtures GREEN/YELLOW/RED · escenarios adicionales útiles ·
simulación del hospital · sistema de notificaciones · seeds · validación de
flujos · QA end-to-end · documentación de demo · pruebas de integración.

**No modificar** la arquitectura principal sin aprobación.

---

## Si necesitas tocar algo que no es tuyo

No lo hagas en silencio. El procedimiento completo, paso a paso, está en
[`AGENTS.md`](../AGENTS.md) § «Si necesitas tocar algo que no es tuyo».

Resumen: anótalo en `docs/HANDOFF.md` bajo *Cambios transversales*, haz el
cambio **mínimo**, y commitéalo **por separado** con prefijo
`cross:` para que sea trivial de revisar o revertir.

---

## Cómo no generar conflictos de merge

1. **Trabaja siempre en tu rama.** Nadie commitea directo a `main`.
2. **Trae `main` antes de empezar:** `git fetch origin && git merge origin/main`.
3. **Commits pequeños y frecuentes.** Un commit gigante al final es una
   garantía de conflicto.
4. **No reformatees archivos ajenos.** Un `prettier --write .` sobre todo el
   repo destruye el trabajo de los otros dos en el merge.
5. **No toques `package.json` por gusto.** Si necesitas una dependencia,
   instálala y dilo en `HANDOFF.md`.
6. **Nunca `git push --force`.** Nunca `git rebase` de ramas compartidas.
