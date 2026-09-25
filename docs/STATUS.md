# STATUS

Estado vivo del proyecto. **Cada workstream mantiene su propia sección** para
evitar conflictos de merge. Actualízala antes de cerrar cada sesión.

---

## Resumen del proyecto

**Última actualización:** 2026-09-25
**Deadline confirmado:** 2026-09-27 23:59 (ver `HACKATHON_RULES.md`)

| Entregable del reto | Estado |
|---|---|
| 1 · Repositorio GitHub con documentación clara | 🟡 Documentado y **auditado: sin secretos en el árbol ni en el historial**. Sigue privado: falta el cambio de visibilidad, que es manual |
| 2 · Enlace del agente en ejecución | ✅ **https://scayl-pulse.vercel.app** · producto completo, **auditoría de navegador 30/30 contra producción** con Supabase y Gemini reales |
| 3 · PDF de herramientas de IA | ✅ [PDF final de cuatro páginas](../output/pdf/SCAYL_Pulse_Herramientas_IA.pdf), generado y revisado visualmente |

| Escenario obligatorio | Resultado | Verificado |
|---|---|---|
| 🟢 GREEN → `VERIFIED` | ✅ | test + API real |
| 🟡 YELLOW → `DOCUMENTS_REQUIRED` → `VERIFIED` | ✅ | test + API real |
| 🔴 RED → `HUMAN_REVIEW` → `VERIFIED` | ✅ | test + API real + navegador |

---

## Workstream A — Backend Core · `anthony/backend-core`

**Última actualización:** 2026-09-25 00:15

### Completed
- Repositorio inicializado, GitHub `Silentarcherjr/scayl-pulse`, tres ramas de trabajo.
- Scaffold Next.js 16 + TypeScript + Tailwind 4 + Vitest; `.gitignore` endurecido; `.env.example`.
- Modelo de dominio: máquina de estados de 7 estados con fuente única de verdad, transiciones permitidas y ranking de restrictividad.
- Contratos Zod para el borde HTTP y para la salida del LLM, más el JSON Schema de salida estructurada.
- Capa determinística: validación de póliza, requisitos documentales por costo y triaje, evaluación de preexistencias sobre tabla clínica declarada.
- **Safety Gate**: suelo determinístico, el modelo solo puede endurecer, verificación de citas de evidencia, documentos del modelo degradados a `ADVISORY`.
- Analizador de evidencia con Gemini detrás de un puerto: salida estructurada, timeout de 20 s, validación Zod, fallback determinístico identificado como tal, registro en `ai_interactions`.
- Orquestador del expediente vivo: ingreso y reevaluación comparten pipeline; transiciones validadas; 22 eventos en un caso RED completo.
- Notificación simultánea a admisiones e aseguradora con `Promise.allSettled`.
- API: `/api/admissions`, `/api/cases`, `/api/cases/:id`, `/api/cases/:id/events`, `/api/cases/:id/evidence`, `/api/demo/scenarios`, `/api/demo/scenarios/:id/run`, `/api/health`.
- Supabase: esquema completo, enums espejo de TypeScript, RLS, **timeline append-only forzado por triggers**, `cases` y `case_events` publicados para Realtime, seeds sintéticos con fechas relativas.
- Página de demostración mínima funcional (la reemplaza Workstream B).
- **Corrección de configuración:** la persistencia en Supabase ahora exige
  `SUPABASE_SERVICE_ROLE_KEY`. Con solo la clave anon el despliegue habría
  cambiado a Supabase y habría fallado en *cada* escritura, porque RLS solo
  concede lectura a anon. Ahora se mantiene en memoria y `/api/health` dice
  exactamente qué falta. Cubierto por tests.
- **`npm run verify:deployment <url>`** — verifica un despliegue real: salud,
  los cinco escenarios, timeline, ambas notificaciones y manejo de errores.
- Autoría de los 11 commits corregida a `amorell776@gmail.com`.
- **Desplegado y verificado en producción** con Supabase como fuente de verdad:
  los cinco escenarios pasan de extremo a extremo contra la base real, con sus
  eventos, evidencia, notificaciones y auditoría de IA persistidos.
- **Corrección de honestidad:** las decisiones tomadas sin modelo se etiquetaban
  `AI_ASSISTED`. Ahora se distinguen `AI_ASSISTED` (modelo real),
  `AI_UNAVAILABLE` (se intentó y falló) y `DETERMINISTIC` (sin proveedor).
- **Tope de casos almacenados** con respuesta `429`: los endpoints de escritura
  son públicos a propósito y sin tope cualquiera puede inflar la base.
- **Gemini funcionando de extremo a extremo en producción**, con cadena de
  modelos ante saturación y presupuesto de tiempo repartido entre los pasos de
  un escenario. Métricas reales en `AI_USAGE_LOG.md`.
- **IDEA-006 entregada (backend)**: `AgentDecision.checks` expone las doce
  comprobaciones con su estado, evidencia y el suelo que imponen — incluidas
  las que pasan. El panel correspondiente ya fue integrado por Workstream B.
- **IDEA-003 entregada**: `GET /api/cases/:id/summary`, resumen para el gestor
  generado bajo demanda y cacheado como evento del timeline. Verificado en
  producción: 9,7 s la primera vez, 0,7 s desde caché.
- **Cierre humano del caso**: `POST /api/cases/:id/resolve` (DEC-011). Exige
  quién cierra y por qué, marca si la persona contradijo al sistema, notifica a
  ambas partes y es terminal. **El backend ya no tiene huecos funcionales.**
- **Verificación de producción sin computadora**: workflow manual en Actions,
  más un smoke de solo lectura tras cada push a `main`.
- **CI en GitHub Actions**: typecheck, lint, tests, build y las 12
  comprobaciones de extremo a extremo en cada push. Detectó en su primer
  intento que `npm run verify` fallaba en un clon limpio (dependíamos de un
  tipo que Next solo genera al construir). Corregido.
- **Esquema aplicado y verificado en Supabase** (proyecto `Pulse`): 9 tablas
  con RLS, Realtime publicando `cases` y `case_events`, semillas cargadas, y
  la inmutabilidad del timeline comprobada contra Postgres 17 — `UPDATE` y
  `DELETE` sobre `case_events` rechazados, `seq` asignada por la base de
  datos. Migración adicional que fija `search_path` en las tres funciones de
  trigger (aviso del linter de Supabase resuelto).
- Documentación completa: `README`, `AGENTS.md`, `CLAUDE.md` y 13 documentos en `docs/`.
- **Auditoría final pre-entrega (feature freeze)** con 27 comprobaciones de
  navegador contra el build de producción: usuario anónimo en incógnito, sin
  cookies ni localStorage, cold start, escritorio y móvil (390 px), refresh
  directo sobre un expediente, GREEN/YELLOW/RED de extremo a extremo,
  evidencia con reevaluación, notificaciones separadas de hospital y
  aseguradora, y ausencia de stack traces. **27/27.**
- **P0 corregido — peticiones del navegador sin tope de tiempo.** Ninguna
  llamada de la interfaz tenía límite: con Supabase o Gemini colgados, los
  estados «Cargando expedientes…», «Comprobando entorno…» o «Guardando
  evidencia…» se quedaban girando sin final. Ahora hay tope general de 120 s
  (generoso: un escenario con seguimientos y modelo real supera los 40 s) y
  15 s en las lecturas de fondo, que se repiten solas.
- **P0 corregido — `/api/health` devolvía 500 con la persistencia caída.** El
  endpoint que existe para informar de la degradación era el que se caía.
  Ahora responde `200` con `status: "degraded"`, `capacity.storedCases: null`
  y una frase mostrable. Contrato actualizado en `API_CONTRACT.md`.
- **P0 corregido — «Comprobando entorno…» perpetuo.** Si `/api/health`
  fallaba, la interfaz no salía nunca de ese estado. Ahora degrada a un
  mensaje terminal que dice que se reintenta.
- **P1 — terminología.** `VERIFIED` pasa de «Cobertura verificada» a
  **«Verificación completada»**: lo primero se lee como una autorización
  definitiva de la aseguradora, que es exactamente lo que este sistema no
  emite.
- **P1 — el recorrido a la vista.** Frase de apertura y tira
  «Ingreso → Póliza → Antecedentes → Análisis → Decisión administrativa →
  Hospital + aseguradora → Nueva evidencia → Reevaluación» en el hero, para
  que un evaluador entienda el sistema sin ejecutar nada.
- **P1 — escenarios legibles para un jurado**, sin el prefijo GREEN/YELLOW/RED
  en el título (la insignia de color se mantiene).
- **Cierre pre-entrega verificado contra PRODUCCIÓN**, no solo en local:
  `audit-production.yml` abre un navegador real contra el despliegue y
  comprueba las 30 garantías críticas. **30/30** sobre `a17f70b`, con
  `persistence: supabase` y `gemini-3.5-flash` respondiendo de verdad.
- **Secret scan completo antes de publicar**: 566 blobs, todas las ramas y todo
  el historial. Los únicos valores con forma de credencial están en
  `tests/configuration.test.ts` y son placeholders declarados (`…FAKE1111…`,
  `sb_secret_super_confidencial`). Ningún `.env` rastreado; `.env.example` sin
  un solo valor. **El repositorio puede hacerse público.**
- **Fuente del PDF de herramientas de IA actualizada al 2026-09-25**: Codex e
  Integrations ya tienen propósito, aplicación, resultados y validación
  humana; cifras alineadas con 128 tests y auditoría 30/30. PDF final de cuatro
  páginas generado y revisado visualmente, sin cortes ni contenido pendiente.
- **Entrada de demo preparada para el jurado sin borrar historial:** tres casos
  canónicos recién generados en producción (`VERIFIED`, `DOCUMENTS_REQUIRED`
  y `HUMAN_REVIEW`), captura real del dashboard y recorrido recomendado de
  tres minutos en el README. Producción conserva todo su historial sintético.

### In Progress
- Nada abierto. Feature freeze activo para la fase clasificatoria.

### Next
1. ~~Aplicar el esquema en Supabase~~ ✅
2. ~~Cargar las variables en Vercel~~ ✅
3. ~~Verificar el despliegue~~ ✅ **12/12 contra https://scayl-pulse.vercel.app con Supabase conectado**
4. **Hacer el repositorio público justo antes de entregar** (entregable #1).
5. ~~Conectar y rotar `GEMINI_API_KEY`~~ ✅ configurada, verificada y rotada.
6. ~~Exportar `AI_USAGE_LOG.md` a PDF al cerrar el desarrollo~~ ✅ generado y revisado.

### Blocked
- Ninguno. Solo queda hacer público el repositorio el 26 de septiembre, por
  decisión explícita del equipo.

### Tests
**128 passing / 0 failing** · typecheck limpio · lint limpio · build de
producción correcto · auditoría de navegador **30/30 contra producción** ·
`verify:deployment` **12/12**.

---

## Workstream B — Frontend · `workstream/frontend`

**Última actualización:** 2026-09-21 07:23

### Completed
- Dashboard con lista, búsqueda y filtros de casos, detalle y vistas de
  hospital y aseguradora, usando los endpoints y tipos existentes.
- Timeline ordenado por `seq`, con decisiones anteriores conservadas;
  panel de comprobaciones «¿Por qué tomó esta decisión?» (IDEA-006).
- Safety Gate visible cuando corrige al modelo; distinción entre documentos
  `BLOCKING` y `ADVISORY` y entre los tres orígenes de la decisión.
- Simulador con ingreso inicial o seguimientos, formulario de ingreso libre
  con documentos sintéticos (IDEA-004), aportación de evidencia y reevaluación.
- Resumen para el gestor solicitado mediante botón (IDEA-003) y cierre humano
  con responsable, motivo y aviso cuando contradice la recomendación.
- Realtime con alternativa por polling y recuperación tras desconexión;
  errores visibles, navegación por teclado y diseño responsive.
- 13 tests propios de frontend y recorrido automatizado de navegador local:
  GREEN, YELLOW con dos documentos, historial RED, resumen, cierre terminal,
  ingreso libre, recarga y tamaños de 390, 768 y 1440 px.
- Código guardado en `4a1c2ba`; `origin/main` incorporado sin conflictos.

### In Progress
- Nada abierto. El frontend está integrado en `main` y desplegado.

### Next
1. Mantener el feature freeze hasta la entrega.

### Blocked
- Ninguno.

### Tests
Los 13 tests de frontend están incorporados a la suite consolidada:
**128 passing / 0 failing**, typecheck y lint correctos. Build de producción y
auditoría de navegador contra producción aprobados.

---

## Workstream C — Integrations / Demo / QA · `workstream/integrations`

**Última actualización:** 2026-09-20 22:30

### Completed
- Punto de partida entregado por Workstream A: 5 escenarios definidos y
  verificados, dataset sintético, seeds SQL alineados con el dataset de
  TypeScript, notificador dual funcionando.
- Rama `workstream/integrations` sincronizada con `origin/main` antes de trabajar.
- 14 tests HTTP nuevos contra Next local: cinco escenarios por webhook y
  runner, evidencia incremental, decisiones anteriores intactas, notificaciones
  duales con aviso de atención, errores y cierre terminal.
- Carga funcional de 20 ingresos concurrentes: IDs únicos, secuencias por
  caso sin colisiones y evidencia aislada.
- Guion de demo aclarado: no prometer `gateOverrode: true` sin verificarlo
  en la respuesta. Documentado el modo local `DETERMINISTIC`.

### In Progress
- Nada abierto. QA e Integrations están integrados en `main`.

### Next
1. Mantener el feature freeze hasta la entrega.

### Blocked
- Ninguno para QA local. Supabase y Gemini ya fueron verificados por A,
  según `HANDOFF.md`; no se accedió a esas cuentas en esta sesión.

### Tests
Los 14 tests HTTP de Integrations están incorporados a la suite consolidada:
**128 passing / 0 failing**, typecheck y lint correctos.
