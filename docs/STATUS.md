# STATUS

Estado vivo del proyecto. **Cada workstream mantiene su propia sección** para
evitar conflictos de merge. Actualízala antes de cerrar cada sesión.

---

## Resumen del proyecto

**Última actualización:** 2026-09-20 08:30
**Deadline operativo:** 2026-09-23 23:59 (ver `HACKATHON_RULES.md`)

| Entregable del reto | Estado |
|---|---|
| 1 · Repositorio GitHub con documentación clara | 🟡 Repo creado y documentado · **sigue privado, hay que publicarlo antes de entregar** |
| 2 · Enlace del agente en ejecución | ✅ **https://scayl-pulse.vercel.app** · desplegado, con Supabase conectado, 12/12 comprobaciones |
| 3 · PDF de herramientas de IA | ✅ `docs/deliverables/SCAYL_Pulse_Herramientas_IA.pdf` · regenerar si cambian las cifras |

| Escenario obligatorio | Resultado | Verificado |
|---|---|---|
| 🟢 GREEN → `VERIFIED` | ✅ | test + API real |
| 🟡 YELLOW → `DOCUMENTS_REQUIRED` → `VERIFIED` | ✅ | test + API real |
| 🔴 RED → `HUMAN_REVIEW` → `VERIFIED` | ✅ | test + API real + navegador |

---

## Workstream A — Backend Core · `anthony/backend-core`

**Última actualización:** 2026-09-20 08:30

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
  las que pasan. Falta el panel, que es del Workstream B.
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

### In Progress
- Nada abierto. El backend está completo.

### Next
1. ~~Aplicar el esquema en Supabase~~ ✅
2. ~~Cargar las variables en Vercel~~ ✅
3. ~~Verificar el despliegue~~ ✅ **12/12 contra https://scayl-pulse.vercel.app con Supabase conectado**
4. **Hacer el repositorio público** antes de entregar (entregable #1). ← lo único que bloquea una entrega hoy
5. Conectar `GEMINI_API_KEY` y registrar métricas reales en `AI_USAGE_LOG.md`: latencia media, tasa de respuestas válidas y **cuántas veces el Safety Gate corrigió al modelo**.
6. Exportar `AI_USAGE_LOG.md` a PDF.

### Blocked
- **Falta `GEMINI_API_KEY`.** Nada más depende de ella: todo lo demás funciona.

### Tests
**94 passing / 0 failing** · typecheck limpio · lint limpio · CI verde ·
`verify:deployment` **12/12 contra producción con Supabase y Gemini reales**.

---

## Workstream B — Frontend · `workstream/frontend`

**Última actualización:** — (sin sesiones todavía)

### Completed
- Punto de partida entregado por Workstream A: contrato de API cerrado y
  documentado, backend en funcionamiento sin credenciales, página de
  demostración mínima que sirve de referencia y está pensada para ser
  reemplazada.

### Next
1. Lista de casos (`GET /api/cases`).
2. Detalle de caso con decisión, evidencia y documentos faltantes.
3. **Timeline del expediente vivo** — ordenar por `seq`, nunca por `createdAt`.
4. Simulador de ingreso con los escenarios.
5. Vistas diferenciadas de hospital y aseguradora.
6. Realtime sobre `case_events`, con polling como alternativa.

### Blocked
- Nada. El backend no bloquea al frontend.

### Tests
—

---

## Workstream C — Integrations / Demo / QA · `workstream/integrations`

**Última actualización:** — (sin sesiones todavía)

### Completed
- Punto de partida entregado por Workstream A: 5 escenarios definidos y
  verificados, dataset sintético, seeds SQL alineados con el dataset de
  TypeScript, notificador dual funcionando.

### Next
1. Verificar los 5 escenarios a mano contra `DEMO_SCENARIOS.md`.
2. Tests de integración HTTP sobre las rutas (`tests/e2e/`).
3. Supabase real: aplicar migrations y seeds, y **verificar que el trigger append-only rechaza de verdad un `UPDATE` sobre `case_events`**.
4. Enriquecer el dataset sintético, manteniendo sincronizados `reference-data.ts` y `seed.sql`.
5. Prueba de carga ligera: 20 ingresos concurrentes sin colisión de `seq`.

### Blocked
- Supabase real requiere credenciales (no bloquea el resto de su trabajo).

### Tests
—
