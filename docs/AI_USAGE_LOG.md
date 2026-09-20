# Registro de uso de herramientas de IA

**Fuente del entregable #3 del reto** (el PDF de herramientas de IA). Se llena
**durante** el desarrollo, no el último día.

Para cada herramienta la organización exige: **propósito**, **aplicación** y
**resultados obtenidos**. Añadimos **validación humana** porque es lo que
distingue un proyecto serio de una demo generada.

> Cómo exportar a PDF: `pandoc docs/AI_USAGE_LOG.md -o SCAYL_Pulse_AI_Tools.pdf`
> (o imprimir a PDF la vista renderizada de GitHub).

---

## Resumen

| Herramienta | Rol en el proyecto | Workstream |
|---|---|---|
| **Claude Code (Opus 5)** | Technical Lead y Backend Lead: arquitectura, backend, Safety Gate, tests, documentación | A |
| **Codex** | Implementación de frontend e integraciones sobre contratos cerrados | B, C |
| **Google Gemini** | Componente de producto: analizador documental de evidencia dentro del agente | A (integración) |

---

## 1. Claude Code — Anthropic (modelo Opus 5)

**Propósito.** Actuar como Technical Lead y Backend Lead: diseñar la
arquitectura, implementar el backend completo, definir los contratos que
permiten trabajar a los otros dos workstreams en paralelo y dejar el
repositorio en estado operativo para el resto del equipo.

**Aplicación.**
- Inspección del entorno e inicialización de Git y del repositorio en GitHub.
- Diseño del modelo de dominio: máquina de estados de siete estados, contrato
  `AgentDecision`, esquemas Zod para el borde HTTP y para la salida del LLM.
- Implementación de la capa determinística: validación de póliza, requisitos
  documentales, evaluación de preexistencias sobre una tabla clínica declarada.
- Implementación del **Safety Gate**, incluida la propiedad de que el modelo
  solo puede endurecer un resultado y nunca ampliarlo.
- Integración de Gemini detrás de un puerto, con salida estructurada, timeout,
  validación y fallback determinístico.
- Esquema de Supabase con inmutabilidad del timeline forzada por triggers.
- 42 tests, incluidos los adversarios contra el Safety Gate.
- Toda la documentación de `docs/`, `AGENTS.md` y `CLAUDE.md`.

**Resultados obtenidos.**
- Backend funcional de extremo a extremo con los tres escenarios obligatorios
  reproducibles.
- 42/42 tests en verde; typecheck y lint limpios.
- Nueve commits temáticos y tres ramas de trabajo listas para el equipo.
- Documentación suficiente para que dos personas con Codex empiecen sin
  reunión previa.

**Validación humana.** Anthony revisa arquitectura y decisiones antes de
fusionar a `main`. Las decisiones no triviales están registradas en
`DECISIONS.md` con su justificación, de modo que son auditables en lugar de
tener que confiarse. Ninguna idea de producto se implementó sin aprobación
humana: las propuestas quedaron en `IDEAS.md` con estado `PROPOSED`.

---

## 2. Codex — OpenAI

**Propósito.** Implementar frontend (Workstream B) e integraciones, demo y QA
(Workstream C) en paralelo al backend, guiado por `AGENTS.md`.

**Aplicación.** _(a completar por Carlos y Sebastián conforme trabajen)_
- Rama `workstream/frontend`: …
- Rama `workstream/integrations`: …

**Resultados obtenidos.** _(a completar)_

**Validación humana.** _(a completar — quién revisó qué, y qué se corrigió)_

> **Instrucción para el equipo:** al cerrar cada sesión de Codex, añade dos o
> tres líneas concretas aquí. «Codex generó el dashboard» no sirve para el
> PDF. «Codex implementó la vista de timeline con suscripción Realtime;
> corregimos a mano el orden de los eventos, que ordenaba por `createdAt` en
> lugar de por `seq`» sí sirve.

---

## 3. Google Gemini — componente del producto

**Propósito.** Es la pieza de IA **dentro** del agente, no una herramienta de
desarrollo. Analiza la evidencia documental del expediente y produce un
análisis estructurado: resumen, motivo, evidencia citada, documentos
faltantes, condiciones potencialmente relacionadas y preguntas abiertas.

**Aplicación.**
- Modelo `gemini-2.5-flash` con salida estructurada (`responseMimeType:
  application/json` + `responseSchema`).
- Integrado detrás del puerto `AiProvider` (`src/core/ai/gemini-provider.ts`).
- Recibe **hechos estructurados**, no prosa: la validez administrativa ya la
  resolvieron las reglas, de modo que el modelo hace análisis, no extracción
  de verdad.
- Toda respuesta se valida con Zod antes de que ningún consumidor la vea.
- El modelo produce una **propuesta**; el Safety Gate determinístico decide.

**Resultados obtenidos.** _(a completar con llamadas reales cuando la
`GEMINI_API_KEY` esté disponible: latencia media, tasa de respuestas válidas,
y cuántas veces el Safety Gate tuvo que corregir al modelo — el dato más
interesante de todo el informe.)_

Ya medido sin la clave: con el proveedor caído, los cinco escenarios siguen
produciendo el resultado esperado mediante reglas determinísticas
(test «los tres escenarios obligatorios siguen siendo reproducibles sin IA
disponible»).

**Validación humana.**
- El modelo nunca decide por sí solo: el Safety Gate puede endurecer su
  propuesta y nunca ampliarla.
- Sus citas de evidencia se verifican contra los registros reales del caso;
  las que apuntan a registros inexistentes se descartan antes de llegar a la
  interfaz.
- Cada llamada se registra en la tabla `ai_interactions` con proveedor,
  modelo, validez, latencia y error.
- Cuando el modelo no está disponible se usa un analizador determinístico que
  **se identifica como tal**. Nunca se falsifica una llamada a Gemini.

---

## Registro de sesiones

| Fecha | Herramienta | Workstream | Qué se hizo | Validado por |
|---|---|---|---|---|
| 2026-09-19 | Claude Code (Opus 5) | A | Bootstrap completo: repo, arquitectura, backend core, Safety Gate, Gemini, Supabase, 42 tests, documentación | Anthony (pendiente de revisión) |
