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
**Status:** APPROVED IF CORE STABLE — aprobada por Anthony el 2026-09-20, condicionada a que el núcleo esté estable
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
**Status:** REJECTED FOR CLASSIFIER — descartada por Anthony el 2026-09-20 para la fase clasificatoria
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
**Status:** DONE — entregada el 2026-09-20 como `GET /api/cases/:id/summary`, bajo demanda y cacheada en el timeline
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

---

## IDEA-004 — Ingreso libre: usar el sistema con un caso real, no solo con escenarios
**Status:** APPROVED — aprobada por Anthony el 2026-09-20 · ejecuta Workstream B
**Propuesta por:** Anthony · 2026-09-19

**Problem.** El pipeline ya es real —los escenarios de demo entran por
`POST /api/admissions` exactamente igual que lo haría el webhook de un
hospital— pero desde la interfaz solo se pueden disparar los cinco escenarios
predefinidos. Un evaluador no puede escribir su propio ingreso y ver qué hace
el sistema, que es justo el momento en que deja de parecer una demo enlatada.

**Idea.** Un formulario de ingreso libre en la interfaz: hospital, cédula,
motivo, código, triaje, costo estimado y documentos adjuntos, enviado al mismo
endpoint. Sin código nuevo de backend: el contrato ya lo acepta.

**Expected impact.** Alto para el jurado y muy barato. Además demuestra el
comportamiento seguro por defecto: si inventan una cédula que no existe, el
caso escala a `HUMAN_REVIEW` explicando que no se pudo identificar al
asegurado, en vez de adivinar.

**Complexity.** LOW — es un formulario. Cae dentro de «simulador de ingreso»,
que ya es alcance del Workstream B en `WORKSTREAMS.md`.

**Risks.** Que alguien lo confunda con uso en producción. Mitigación: la
interfaz ya avisa de que todos los datos son sintéticos, y un ingreso contra
un asegurado inexistente termina en revisión humana por diseño.

---

## IDEA-005 — Lo que faltaría para uso real (fuera del alcance de la clasificatoria)
**Status:** REJECTED FOR CLASSIFIER — descartada por Anthony el 2026-09-20 para la fase clasificatoria
**Propuesta por:** Anthony · 2026-09-19

**Problem.** El agente y su pipeline son reales, pero el entorno alrededor es
de demostración. Conviene tenerlo escrito para no confundir una cosa con la
otra ante el jurado ni ante nosotros mismos.

**Idea.** Cuatro piezas, ninguna en el alcance del 23 de septiembre:

1. **Notificaciones de verdad.** Hoy se persisten en la tabla `notifications`
   con su contenido completo, pero no se envía correo ni SMS. Falta un
   proveedor real (Resend, Twilio) detrás de un puerto, como ya se hizo con
   Gemini.
2. **Alta de datos de referencia.** Hospitales, asegurados y pólizas solo
   entran por SQL. Haría falta una API o un panel de administración.
3. **Autenticación y multi-tenant.** Hoy RLS concede lectura abierta porque
   todos los datos son sintéticos. Ver IDEA-002.
4. **Ingesta documental real.** La evidencia es texto plano; faltaría subida
   de archivos y OCR, que es donde Gemini aportaría bastante más.

**Expected impact.** Ninguno para clasificar. Decisivo para cualquier
conversación posterior.

**Complexity.** HIGH en conjunto.

**Risks.** Intentar algo de esto antes del 23 pone en riesgo lo que ya
funciona. **No abordar durante la fase clasificatoria.**

---

## IDEA-006 — «¿Por qué tomó esta decisión?»
**Status:** DONE (backend) — contrato entregado el 2026-09-20; falta el panel en Workstream B — propuesta y aprobada por Anthony el 2026-09-20
**Implementa:** Workstream A (contrato) + Workstream B (panel)

**Problem.** Hoy la decisión se explica en prosa: `reason` es un texto
multilínea con viñetas. Eso obliga al frontend a parsear texto y, sobre todo,
**solo cuenta lo que falló**. Un gestor no puede ver de un vistazo qué se
comprobó y salió bien, que es la mitad de la confianza.

**Idea.** Exponer la decisión como una lista estructurada de comprobaciones,
cada una con su estado y su evidencia:

```
HUMAN_REVIEW

Reglas activadas
  ✓ Póliza vigente
  ✓ Hospital dentro de red
  ⚠ Antecedente potencialmente relacionado
  ⚠ Evidencia insuficiente

Evidencia utilizada
  Póliza POL-3003 · Historial MH-003 · Informe de ingreso EV-008

Safety Gate
  Se impidió una decisión automática por evidencia insuficiente.
```

**Expected impact.** Convierte el proyecto en **IA auditable**, que es
exactamente el argumento diferencial frente a un clasificador opaco. Es
también lo que un jurado puede evaluar sin entender el código.

**Complexity.** BAJA. La capa determinística ya calcula todas estas
comprobaciones; simplemente descarta las que pasan. El trabajo es emitirlas
todas en un array estable en `AgentDecision`, no recalcular nada.

**Risks.** Ampliar el contrato de `AgentDecision`. Mitigación: es aditivo,
`reason` se mantiene para quien ya lo use, y se documenta en el mismo commit.
