# Ideas de producto

**Este archivo es crítico.** Es el mecanismo que impide que el alcance se nos
vaya de las manos mientras tres agentes construyen en paralelo.

## Regla

Si descubres una **nueva idea de producto**, **NO la implementes**.
Regístrala aquí con estado `PROPOSED`.

Una idea solo puede implementarse cuando **una persona** cambia el estado a
`APPROVED`. Un agente **nunca** aprueba su propia idea.

### Qué NO va aquí

Bugs · tests · refactors · optimización normal. Eso es trabajo ordinario:
hazlo y regístralo en `STATUS.md`.

### Formato

```markdown
## IDEA-XXX — Título corto
**Status:** PROPOSED | APPROVED | REJECTED | DONE
**Propuesta por:** agente / persona · fecha absoluta

**Problem** — qué problema real resuelve.
**Idea** — qué es, en dos o tres frases.
**Expected impact** — qué mejora concretamente (demo, seguridad, jurado, UX).
**Complexity** — LOW | MEDIUM | HIGH, con estimación en horas.
**Risks** — qué puede salir mal, y qué se rompe si sale mal.
```

---

## IDEA-001 — Modo «qué pasaría si» sobre un caso cerrado
**Status:** PROPOSED
**Propuesta por:** Claude Code (Workstream A) · 2026-09-19

**Problem.** El jurado ve el resultado final, pero no percibe cuánta lógica
hay detrás hasta que algo cambia.

**Idea.** Un panel que permita alterar un dato del expediente (vencer la
póliza, quitar un documento, mover la fecha de diagnóstico) y reejecutar el
pipeline **sin guardar**, mostrando lado a lado la decisión original y la
hipotética.

**Expected impact.** Convierte una demo pasiva en una demostración
interactiva del Safety Gate. Alto impacto para el jurado, cero riesgo clínico.

**Complexity.** MEDIUM — ~4 h. El pipeline ya es puro sobre `CaseFacts`;
requiere una ruta `POST /api/cases/:id/simulate` que no persista.

**Risks.** Confundir una simulación con una decisión real. Mitigación: nunca
escribe en `case_events` y la UI la marca como hipotética.

---

## IDEA-002 — RLS multi-tenant real por aseguradora y hospital
**Status:** PROPOSED
**Propuesta por:** Claude Code (Workstream A) · 2026-09-19

**Problem.** Hoy la política RLS es «anon puede leer todo», aceptable solo
porque los datos son 100 % sintéticos.

**Idea.** Políticas por tenant: un hospital ve únicamente sus ingresos, un
gestor únicamente las pólizas de su aseguradora, apoyadas en Supabase Auth y
un claim de organización.

**Expected impact.** Necesario para cualquier conversación seria post-hackathon.
Impacto bajo en la fase clasificatoria.

**Complexity.** HIGH — auth, roles, migración de políticas, tests.

**Risks.** Consume tiempo del MVP y puede romper la demo si se hace con
prisa. **No abordarlo antes del 23 de septiembre.**

---

## IDEA-003 — Resumen de caso en un párrafo para el gestor
**Status:** PROPOSED
**Propuesta por:** Claude Code (Workstream A) · 2026-09-19

**Problem.** Un gestor que abre un caso `HUMAN_REVIEW` a las 3 a.m. necesita
entenderlo en diez segundos, no leer un timeline de quince eventos.

**Idea.** Un párrafo generado sobre el timeline completo —no sobre el ingreso—
que responda: qué pasó, qué cambió desde la última revisión y qué decisión se
espera de la persona.

**Expected impact.** Es exactamente la clase de cosa en la que un LLM aporta
valor real y sin riesgo: resume hechos ya decididos por reglas.

**Complexity.** LOW — ~2 h. Reutiliza el puerto de proveedor existente.

**Risks.** Que el resumen contradiga la decisión. Mitigación: se genera
**después** del Safety Gate y recibe el `AgentDecision` final como entrada.
