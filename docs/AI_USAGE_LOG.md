# Registro de uso de herramientas de IA

**Fuente del entregable #3 del reto** (el PDF de herramientas de IA). Se llena
**durante** el desarrollo, no el último día.

Para cada herramienta la organización exige: **propósito**, **aplicación** y
**resultados obtenidos**. Añadimos **validación humana** porque es lo que
distingue un proyecto serio de una demo generada.

> **PDF final generado.** El entregable revisado está en
> [`output/pdf/SCAYL_Pulse_Herramientas_IA.pdf`](../output/pdf/SCAYL_Pulse_Herramientas_IA.pdf).
> Este archivo conserva la fuente viva y trazable de su contenido.
>
> Cuando el proyecto esté cerrado, desde cualquier máquina con Chrome:
> ```bash
> npm run build:pdf -- output/pdf/SCAYL_Pulse_Herramientas_IA.pdf
> ```
> **Sin Chrome, o desde el móvil:** lanza el workflow **«Generar PDF del
> entregable»** en la pestaña Actions de GitHub y descarga el artefacto.
> La plantilla es [`deliverables/ai-tools-report.html`](deliverables/ai-tools-report.html);
> actualiza ahí únicamente cifras verificables antes de volver a generar.

---

## Resumen

| Herramienta | Rol en el proyecto | Workstream |
|---|---|---|
| **Claude Code** | Technical Lead y Backend Lead: arquitectura, backend, Safety Gate, tests, documentación | A |
| **Codex** | Implementación de frontend e integraciones sobre contratos cerrados | B, C |
| **Google Gemini** | Componente de producto: analizador documental de evidencia dentro del agente | A (integración) |

---

## 1. Claude Code — Anthropic

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
- Suite final de 128 tests, incluidos los adversarios contra el Safety Gate,
  pruebas HTTP reales y estados degradados.
- Toda la documentación de `docs/`, `AGENTS.md` y `CLAUDE.md`.

**Resultados obtenidos.**
- Producto funcional de extremo a extremo con los tres escenarios obligatorios
  reproducibles, Supabase y Gemini reales en producción.
- 128/128 tests en verde; typecheck y lint limpios; build de producción
  comprobado en CI.
- Auditoría de navegador contra producción con 30/30 garantías críticas:
  escritorio, móvil, casos GREEN/YELLOW/RED, reevaluación, notificaciones y
  degradación controlada.
- Documentación y contratos suficientes para que los tres workstreams
  trabajaran en paralelo sin redefinir el dominio.

**Validación humana.** Anthony revisa arquitectura y decisiones antes de
fusionar a `main`. Las decisiones no triviales están registradas en
`DECISIONS.md` con su justificación, de modo que son auditables en lugar de
tener que confiarse. Ninguna idea de producto se implementó sin aprobación
humana: las propuestas quedaron en `IDEAS.md` con estado `PROPOSED`.

---

## 2. Codex — OpenAI

**Propósito.** Implementar frontend (Workstream B) e integraciones, demo y QA
(Workstream C) en paralelo al backend, guiado por `AGENTS.md`.

**Aplicación.**
- En `workstream/frontend`, implementación del dashboard hospital/aseguradora,
  lista, búsqueda y filtros de expedientes, detalle del caso, timeline por
  `seq`, decisiones históricas y panel de doce comprobaciones del Safety Gate.
- Simulador de escenarios, ingreso libre, aportación de evidencia con
  reevaluación, resumen bajo demanda, cierre humano y Realtime con alternativa
  por polling.
- En `workstream/integrations`, construcción de pruebas HTTP contra Next local
  para los cinco escenarios, evidencia incremental, notificación dual,
  errores, cierre terminal y veinte ingresos concurrentes.
- Revisión automatizada de presentación: estados, documentos `BLOCKING` frente
  a `ADVISORY`, origen real de cada decisión y corrección del modelo visible.

**Resultados obtenidos.**
- Interfaz completa y responsive para dos audiencias, integrada en `main` y
  desplegada en producción.
- 13 pruebas específicas de frontend y 14 pruebas HTTP de integración; la
  suite consolidada terminó en **128/128 pruebas correctas**.
- Timeline auditable, decisiones anteriores, evidencia, notificaciones y
  cierre humano demostrables desde el navegador sin credenciales.
- Prueba de veinte ingresos concurrentes sin colisiones de identificadores ni
  secuencias, con aislamiento de evidencia entre casos.

**Validación humana.** Carlos González autorizó el alcance y la publicación del
frontend; Sebastián Sánchez autorizó el alcance de Integrations y la ejecución de su
suite. Anthony validó la configuración del despliegue y rotó la credencial de
Gemini antes de la entrega. La auditoría posterior encontró dos
fallos críticos de resiliencia —peticiones de navegador sin límite y un
`/api/health` que fallaba al degradarse Supabase—; ambos se corrigieron y se
volvieron a verificar antes del feature freeze.

---

## 3. Google Gemini — componente del producto

**Propósito.** Es la pieza de IA **dentro** del agente, no una herramienta de
desarrollo. Analiza la evidencia documental del expediente y produce un
análisis estructurado: resumen, motivo, evidencia citada, documentos
faltantes, condiciones potencialmente relacionadas y preguntas abiertas.

**Aplicación.**
- Cadena configurable de modelos primario y de respaldo, con salida
  estructurada (`responseMimeType: application/json` + `responseSchema`).
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
| Solicitudes al modelo primario con 503 *high demand* | 3 |
| Resueltas por la **cadena de respaldo** | 7 de 8 |
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
| 2026-09-26 | Claude Code | A | Revisión de publicación: `npm run verify` 128/128, producción sana, secretos buscados también en commits huérfanos de GitHub (encontró la clave antigua, ya revocada, en `5ca3f8e`). Pulió el formato del PDF (separadores sueltos, encabezados huérfanos) sin cambiar contenido. | Anthony: confirmó la clave eliminada e hizo público el repositorio |
| 2026-09-25 | Codex | A — Anthony | Ajustó el paquete final para identificar las herramientas de IA sin publicitar versiones concretas de modelos; corrigió los nombres de Carlos González y Sebastián Sánchez; regeneró y revisó visualmente las cuatro páginas del PDF. | Anthony solicitó ambos cambios; PDF sin nombres de modelo específicos, enlaces verificados y 128 tests en verde |
| 2026-09-25 | Codex | A — Anthony | Auditoría profesional completa del repositorio y la entrega: instalación reproducible, dependencias, CI, build, enlaces, metadatos, documentación, producción y expedientes recomendados; corrigió inconsistencias documentales, presentación del README y cerró el PDF definitivo. | Anthony autorizó toda la preparación excepto hacer público el repositorio; `npm audit` sin vulnerabilidades, 128 tests y CI de `main` en verde |
| 2026-09-24 | Codex | A — Anthony | Preparó la entrada de evaluación sin añadir funcionalidad: conservó el historial sintético, generó tres casos canónicos en producción, capturó el dashboard real y añadió al README un recorrido de tres minutos para el jurado. | Anthony aprobó proceder y prefirió conservar los casos existentes para que el jurado pudiera ver uso real; estados de los tres casos validados contra la API |
| 2026-09-24 | Codex | A — Anthony | Actualización de la fuente y plantilla del PDF: incorporó resultados finales de frontend e Integrations, 128 tests, auditoría 30/30 y fecha confirmada; generó un preview temporal y corrigió la paginación de cinco a cuatro páginas. | Anthony solicitó la actualización; revisión final de contenido pendiente al cierre del desarrollo |
| 2026-09-21 | Codex | B — Carlos González | Frontend del expediente vivo sobre la API existente: dashboard, timeline, Safety Gate, ingreso libre, evidencia, reevaluación, resumen y cierre. 13 tests de frontend, recorrido de navegador y build aprobados; `npm run verify` con 108 tests tras incorporar main. Documentación de entrega actualizada sin modificar la sección C. | Carlos González autorizó alcance y publicación; revisión humana final de código/UX pendiente |
| 2026-09-19 | Claude Code | A | Bootstrap completo: repo, arquitectura, backend core, Safety Gate, Gemini, Supabase, 42 tests, documentación | Anthony (pendiente de revisión) |
| 2026-09-20 | Claude Code | A | Despliegue en Vercel, Supabase en producción, CI, tope de casos, integración Gemini funcionando de extremo a extremo, 72 tests | Anthony |
| 2026-09-21 | Claude Code | A | Cierre pre-entrega: merge a `main`, espera del despliegue y **auditoría de 30 comprobaciones con navegador real contra producción** (30/30, Supabase y Gemini reales). Secret scan de 566 blobs sobre todo el historial y el árbol: limpio. Documentación de entrega alineada con producción. | Anthony (pendiente de revisión) |
| 2026-09-21 | Claude Code | A | Auditoría final pre-entrega bajo feature freeze: 27 comprobaciones de navegador (incógnito, cold start, escritorio, móvil, refresh directo), GREEN/YELLOW/RED de extremo a extremo, evidencia y reevaluación, Supabase caído y `/api/health` caído. Dos P0 corregidos (peticiones sin tope de tiempo; `/api/health` devolvía 500 con la persistencia caída) más P1 de copy. 128 tests, build de producción correcto. | Anthony (pendiente de revisión) |
| 2026-09-20 | Codex | C — Sebastián Sánchez | Clon en rama Integrations; 14 tests HTTP contra Next local para cinco escenarios, reevaluación, notificaciones, errores, cierre y 20 ingresos concurrentes; guion y documentación QA. Resultado automatizado: `npm run verify`, 108 passing / 0 failing, typecheck y lint correctos. Sin llamadas a Gemini/Supabase ni cambios al frontend. | Sebastián Sánchez autorizó alcance y clonación; revisión humana de código, resultados y demo pendiente |

### Incidencias reales durante la integración (útiles para el informe)

Merecen aparecer en el PDF porque muestran verificación real, no una
integración de escaparate:

1. **Formato de clave.** Google migró las claves de Gemini de `AIza`
   (*standard keys*) a `AQ.` (*authorization keys*) durante 2026. Nuestra
   validación reconocía solo el formato antiguo y rechazaba una clave válida.
   Corregido: ahora reconoce ambos e informa del formato detectado.
2. **Compatibilidad de modelos.** El proveedor anunció la retirada del modelo
   elegido inicialmente. Se trasladó la selección a configuración y se dejó
   una cadena de respaldo para poder migrar sin modificar el dominio.
3. **Saturación del proveedor.** El modelo primario devuelve `503 high demand`
   con frecuencia. Reintentarlo no sirve —devuelve 503 otra vez—, así que el
   sistema recorre una cadena de modelos. 7 de 8 respuestas válidas llegaron
   por esa vía.
4. **Presupuesto de tiempo.** Un timeout fijo demasiado corto convirtió un
   servicio lento en uno que fallaba siempre. Se sustituyó por un presupuesto
   total repartido entre los pasos de un escenario.
5. **Una espera sin final.** El servidor tenía presupuesto de tiempo, pero el
   navegador no: ninguna petición de la interfaz tenía tope. Con Supabase o
   Gemini colgados, «Cargando expedientes…» giraba indefinidamente y nada
   indicaba que el sistema ya no iba a contestar. Detectado en la auditoría
   final interceptando peticiones que nunca responden, no leyendo el código.
6. **El termómetro con fiebre.** `/api/health`, cuyo trabajo es informar de la
   degradación, devolvía `500` cuando Supabase no respondía: justo cuando hacía
   falta, dejaba de informar. Ahora responde `200` con `status: "degraded"`.
7. **Un mensaje de commit más alarmante que los hechos.** `d15833b` decía haber
   retirado «una clave real de API» del repositorio. El escaneo del historial
   completo mostró que el valor sustituido era una secuencia sintética. Lo que
   sí ocurrió fue una clave real pegada en la variable equivocada de Vercel y
   servida por `/api/health`. La primera auditoría concluyó que nunca llegó a
   git; la revisión previa a publicar (2026-09-26) encontró que sí estuvo en un
   commit anterior a la reescritura del historial, ya fuera de toda rama. La
   clave estaba rotada y eliminada, así que no quedó exposición activa.
   Merece estar en el informe porque muestra la diferencia entre auditar y
   creerse la propia documentación.
8. **El detector que se delata solo.** La primera versión del escáner de
   secretos marcaba `/api/health` como fuga: buscaba `service_role` y estaba
   encontrando el *nombre* `SUPABASE_SERVICE_ROLE_KEY`, que el contrato expone
   a propósito. Un detector que confunde nombres con valores entrena a ignorar
   sus propias alarmas.
