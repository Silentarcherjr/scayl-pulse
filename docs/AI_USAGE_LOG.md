# Registro de uso de herramientas de IA

**Fuente del entregable #3 del reto** (el PDF de herramientas de IA). Se llena
**durante** el desarrollo, no el último día.

Para cada herramienta la organización exige: **propósito**, **aplicación** y
**resultados obtenidos**. Añadimos **validación humana** porque es lo que
distingue un proyecto serio de una demo generada.

> **El PDF se genera al final, no ahora.** Este archivo es la fuente viva: se
> actualiza durante el desarrollo, y las cifras de Gemini cambiarán cuando el
> frontend genere tráfico real.
>
> Cuando el proyecto esté cerrado, desde cualquier máquina con Chrome:
> ```bash
> npm run build:pdf   # → docs/deliverables/SCAYL_Pulse_Herramientas_IA.pdf
> ```
> **Sin Chrome, o desde el móvil:** lanza el workflow **«Generar PDF del
> entregable»** en la pestaña Actions de GitHub y descarga el artefacto.
> La plantilla es [`deliverables/ai-tools-report.html`](deliverables/ai-tools-report.html);
> actualiza ahí las cifras finales antes de generar. El PDF está en
> `.gitignore` a propósito: es un artefacto, no fuente.

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

**Resultados obtenidos (medidos en producción, 2026-09-20).**

Medido sobre el despliegue real en `https://scayl-pulse.vercel.app`, con
Supabase como fuente de verdad. Todas las llamadas quedan registradas en la
tabla `ai_interactions`, así que estas cifras son auditables y no estimadas.

| Métrica | Valor |
|---|---|
| Llamadas a Gemini | 16 |
| Respuestas válidas contra el esquema | 8 (**50 %**) |
| Latencia media de una respuesta válida | **12,6 s** |
| Latencia máxima | 19,5 s |
| Modelo primario (`gemini-3.5-flash`) con 503 *high demand* | 3 |
| Resueltas por el **fallback de modelo** a `gemini-2.5-flash` | 7 de 8 |
| Decisiones etiquetadas `AI_ASSISTED` | 5 |
| **Veces que el Safety Gate tuvo que corregir al modelo** | **0** |

**Lectura honesta de estos números:**

La **tasa de validez del 50 %** no mide la calidad del modelo: mide la carga
de la infraestructura de Google en el momento de la prueba. Los fallos son
`503 high demand` y timeouts, no respuestas malformadas. De hecho **ninguna
respuesta de Gemini falló la validación de esquema**: cuando contesta,
contesta bien formada.

La latencia de ~12 s es alta para una interacción síncrona y es la razón por
la que el sistema reparte un presupuesto de tiempo entre los pasos de un
escenario en lugar de usar un timeout fijo.

**Que el Safety Gate no haya tenido que corregir al modelo ni una vez es un
buen resultado, no una prueba fallida.** Significa que, con hechos
estructurados como entrada, el modelo llegó a la misma conclusión que las
reglas en los cinco escenarios. La capacidad de corregirlo está demostrada
aparte, en tests que lo enfrentan a un modelo adversario que propone
`VERIFIED` para una póliza vencida y cita pólizas inexistentes: ahí el Gate lo
restringe y descarta las citas inventadas.

**Ejemplo real de salida del modelo** (escenario RED, confianza 0,7):

> «La póliza está activa y el hospital está en red, y toda la documentación
> requerida ha sido presentada. Sin embargo, existen condiciones preexistentes
> (Hipertensión arterial esencial y Dislipidemia mixta) que podrían estar
> relacionadas con el motivo de ingreso actual (dolor torácico) y no han sido
> aclaradas por la evidencia actual.»

El modelo propuso `HUMAN_REVIEW` por su cuenta, coincidiendo con la regla
determinística, y **citó únicamente registros que existen** en la base de
datos: las dos entradas de historial, la póliza, el hospital y los cinco
documentos del expediente.

**Resiliencia verificada.** Con el proveedor caído, los cinco escenarios
siguen produciendo el resultado esperado mediante reglas determinísticas, y la
decisión se marca `AI_UNAVAILABLE` en lugar de fingir que hubo modelo.

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
| 2026-09-20 | Claude Code (Opus 5) | A | Despliegue en Vercel, Supabase en producción, CI, tope de casos, integración Gemini funcionando de extremo a extremo, 72 tests | Anthony |

### Incidencias reales durante la integración (útiles para el informe)

Merecen aparecer en el PDF porque muestran verificación real, no una
integración de escaparate:

1. **Formato de clave.** Google migró las claves de Gemini de `AIza`
   (*standard keys*) a `AQ.` (*authorization keys*) durante 2026. Nuestra
   validación reconocía solo el formato antiguo y rechazaba una clave válida.
   Corregido: ahora reconoce ambos e informa del formato detectado.
2. **Modelo en retirada.** El modelo elegido inicialmente, `gemini-2.5-flash`,
   se apaga el 16 de octubre de 2026. Se cambió el predeterminado a
   `gemini-3.5-flash` y se dejó el anterior como respaldo mientras siga vivo.
3. **Saturación del proveedor.** `gemini-3.5-flash` devuelve `503 high demand`
   con frecuencia. Reintentar el mismo modelo no sirve —devuelve 503 otra
   vez—, así que el sistema recorre una cadena de modelos. 7 de 8 respuestas
   válidas llegaron por esa vía.
4. **Presupuesto de tiempo.** Un timeout fijo demasiado corto convirtió un
   servicio lento en uno que fallaba siempre. Se sustituyó por un presupuesto
   total repartido entre los pasos de un escenario.
