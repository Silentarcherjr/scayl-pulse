# HANDOFF

Continuidad entre sesiones. **Cada workstream mantiene su propia sección.**
Rellénala antes de detenerte, siempre — incluso si la sesión fue corta.

---

## ⚠️ Acciones humanas pendientes

Cosas que **un agente no puede hacer** y que bloquean entregables.

| # | Acción | Quién | Estado |
|---|---|---|---|
| 1 | **Hacer público el repositorio** antes de entregar | Anthony | ⬜ pendiente · bloquea el entregable #1 · **secret scan limpio: se puede publicar** |
| 2 | Desplegar en Vercel | Anthony | ✅ **https://scayl-pulse.vercel.app** |
| 3 | Aplicar el esquema en Supabase | Anthony | ✅ hecho y **verificado contra Postgres 17** (proyecto `Pulse`, ref `yextrojwkgdyefkxbsne`) |
| 4 | Cargar las 3 variables de Supabase en Vercel | Anthony | ✅ verificado: `persistence: supabase` |
| 5 | `GEMINI_API_KEY` | Anthony | ✅ configurada y verificada en producción |
| 6 | **Confirmar con la organización la fecha real de entrega** (23 vs. 27 de septiembre) | Anthony | ⬜ pendiente |
| 7 | Invitar a Carlos y Sebastián | Anthony | ✅ `frictionspp-svg` y `LowCrime` invitados con permiso de escritura · pendientes de aceptar |

### Reiniciar los datos de demo

Los casos son inmutables (DEC-008), así que **`DELETE` no funciona**: la
cascada hacia `case_events` choca con el trigger append-only. Para dejar la
base limpia conservando los datos de referencia, en el SQL Editor de Supabase:

```sql
truncate table ai_interactions, notifications, case_evidence, case_events, cases
  restart identity cascade;
```

Hospitales, pacientes, pólizas y antecedentes no se tocan. Si también quieres
recargarlos, ejecuta después `supabase/seed.sql`.

La ocupación actual y el tope los ves en `GET /api/health`, campo `capacity`.

### ⚠️ Trampa al configurar las variables en Vercel

Vercel detecta 8 variables desde `.env.example` y las crea vacías. **Deja
`SCAYL_FORCE_IN_MEMORY` y `SCAYL_FORCE_FIXTURE_AI` vacías**: si les pones
`true`, el despliegue ignora Supabase y Gemini aunque estén bien configurados.
Vacías son inofensivas (el código trata vacío como no definida).

Y la persistencia necesita **`SUPABASE_SERVICE_ROLE_KEY`**, no la clave anon:
RLS solo concede lectura a anon. Sin la service-role, la app se queda en
memoria a propósito y `/api/health` lo dice en el campo `persistenceNote`.

**Aplica el esquema ANTES de cargar las variables.** Si apuntas a Supabase sin
las tablas creadas, cada ingreso falla contra tablas inexistentes.

### Comandos exactos para cada una

**1 · Hacer público el repositorio**
```bash
gh repo edit Silentarcherjr/scayl-pulse --visibility public --accept-visibility-change-consequences
```

**Y justo después, protege `main`:**
```bash
bash scripts/protect-main.sh
```
GitHub no permite proteger ramas en repos privados con cuenta gratuita (pide
Pro), así que este paso **solo funciona una vez el repo es público**. Hazlo en
la misma sesión para no olvidarlo: deja `main` accesible solo por Pull Request
con CI en verde, sin aprobaciones requeridas para no bloquearos, y sin force
push ni borrado. Los admins pueden saltárselo en una emergencia.

Una sesión de Claude en la nube también puede ejecutarlo: `api.github.com`
está en su allowlist.

**2 · Verificar el despliegue**
```bash
npm run verify:deployment -- https://<tu-url>.vercel.app
```

**Desde el móvil, sin computadora.** Verificado el 2026-09-20 en una sesión
de Claude en la nube. Conviene distinguir dos cosas que se confunden:

| Vía | Alcance |
|---|---|
| **Red del sandbox** (curl, tests, código) | Allowlist: ✅ `api.github.com`, `generativelanguage.googleapis.com`, `registry.npmjs.org` · ❌ Vercel, Supabase, resto de internet |
| **Conectores MCP** | No pasan por esa allowlist, van por el proxy de Anthropic: ✅ Supabase, GitHub, Cloudflare |

O sea: **sí se puede operar Supabase desde el móvil** —ejecutar SQL, aplicar
migrations, leer advisors, reiniciar datos de demo— aunque `curl` a
`*.supabase.co` falle. Lo que no se puede es que el *código* que corre ahí
alcance Supabase o Vercel: nada de tests de integración ni de
`verify:deployment` desde el sandbox.

⚠️ **El conector de Supabase escribe en producción directamente, sin rama de
staging.** Un agente no debe ejecutar nada que toque esquema o datos sin
petición humana explícita.

Para verificar producción desde donde estés, lanza el workflow **«Verificar
producción»** desde la pestaña Actions de GitHub: corre las mismas 12
comprobaciones desde un runner con salida libre.

**Lo que sigue necesitando tus manos en un navegador:**
- **Hacer público el repositorio.** Ninguna herramienta MCP expone el cambio de
  visibilidad, así que no hay agente que pueda hacerlo. Bloquea el entregable #1.
- **Variables de entorno en Vercel.**

Es manual a propósito: cada ejecución crea 5 casos reales en producción y el
tope es 200. El smoke de `/api/health` sí corre solo tras cada push a `main`,
porque es de solo lectura, y falla el CI si el despliegue deja de usar
Supabase.
Comprueba salud, los cinco escenarios, el timeline, ambas notificaciones y el
manejo de errores. 12 comprobaciones; sale con código distinto de cero si algo
falla. La aplicación **funciona desplegada sin ninguna variable de entorno**
(repositorio en memoria + analizador determinístico), así que el enlace ya es
entregable aunque Supabase no esté listo.

**3 · Variables de Supabase**
```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```
Y aplicar el esquema:
```bash
npx supabase link --project-ref <ref>
npx supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

**4 · Gemini**
```bash
npx vercel env add GEMINI_API_KEY production
echo 'GEMINI_API_KEY=...' >> .env.local     # nunca lo commitees
```

**6 · Invitar colaboradores**
```bash
gh api -X PUT repos/Silentarcherjr/scayl-pulse/collaborators/<usuario-github> -f permission=push
```

---

## Workstream A — Backend Core · `anthony/backend-core`

### Cierre pre-entrega — 2026-09-21

Todo mergeado a `main`. Producción sirve **`a17f70b`** y fue auditada con
navegador real: **30/30**, con `persistence: supabase` y `gemini-3.5-flash`
respondiendo de verdad, no el fallback.

**Secret scan previo a publicar — limpio.** 566 blobs, todas las ramas, todo el
historial, 14 familias de credencial. Los únicos valores con forma de clave
viven en `tests/configuration.test.ts` y son placeholders declarados. Ningún
`.env` rastreado y `.env.example` no tiene un solo valor asignado.

> ⚠️ **Matiz sobre el commit `d15833b`.** Su mensaje afirma que el commit
> anterior había metido «una clave real de API» en un test. El valor que
> sustituyó era `AIzaSyA1234567890abcdefghijklmnopqrstuv` — una secuencia
> sintética, no una clave. El mensaje exagera lo ocurrido. Lo que sí pasó de
> verdad, y está documentado en el propio test, es que una clave real se pegó
> en `GEMINI_MODEL` en Vercel y `/api/health` la devolvió literalmente
> (corregido en `0a0ef16`). Esa exposición fue **por el endpoint, nunca por
> git**. Aun así, **rotar esa clave de Gemini sigue siendo lo prudente**: el
> repositorio no la contiene, pero estuvo servida en abierto.

**Herramienta nueva:** `npm run` no la necesita, pero existe el workflow manual
**Auditoría de producción** (`audit-production.yml`). `verify:deployment`
comprueba el contrato HTTP; esto comprueba lo que ve una persona. Las sesiones
en la nube no alcanzan el despliegue por red, así que corre en Actions.

---

### Auditoría final pre-entrega — 2026-09-21

Feature freeze activo. Sin funcionalidad nueva de producto; solo correcciones
de los P0/P1 encontrados.

**P0 encontrados: 2 (ambos corregidos).**

1. **Ninguna petición del navegador tenía tope de tiempo.** El servidor sí
   tiene presupuesto para Gemini, pero la interfaz no tenía nada: una
   respuesta que nunca llega dejaba «Cargando expedientes…», «Comprobando
   entorno…» o «Guardando evidencia y reevaluando…» girando para siempre.
   Reproducido interceptando peticiones que no resuelven. Corregido en
   `case-api.ts` con tope general de 120 s y 15 s para las lecturas de fondo.
   **Por qué 120 s y no menos:** un escenario con seguimientos contra Gemini
   real tarda más de 40 s en producción. Un tope corto habría roto la demo.
2. **`/api/health` devolvía 500 con la persistencia caída.** Verificado
   apuntando la app a un Supabase inalcanzable. Ahora responde `200` con
   `status: "degraded"` y `capacity.storedCases: null`.

**Falso positivo descartado:** la primera pasada marcó «el timeline no creció
tras la evidencia». Era una carrera en el propio script de auditoría, que leía
la pestaña antes del refresco. Comprobado aparte: 11 → 22 eventos, reflejado
en la interfaz en 515 ms.

**Verificado y correcto sin cambios:** escenarios sin configuración previa
(P0-2), GREEN/YELLOW/RED de extremo a extremo (P0-4), evidencia y reevaluación
con historial conservado (P0-5), degradación de Gemini (P0-6, cubierta por
`model-chain.test.ts` y los proveedores adversarios de `helpers.ts`), envelope
limpio sin stack ante Supabase caído (P0-7 y P0-8), y notificaciones separadas
de hospital y aseguradora (P0-9).

**Riesgos que quedan abiertos:** ver la sección de riesgos más abajo.

---

**Fecha:** 2026-09-19
**Último commit:** ver `git log -1 --oneline` en la rama
**Sesión:** bootstrap completo del proyecto + preparación del despliegue (Claude Code, Opus 5)

> Nota: la autoría de los 11 commits iniciales se reescribió a
> `amorell776@gmail.com` y se forzó el push. Era seguro porque ninguna
> invitación estaba aceptada todavía y nadie había clonado. El contenido no
> cambió: el hash del árbol es idéntico antes y después.

### Qué funciona
Todo el backend, de extremo a extremo, **sin ninguna credencial**:

- `POST /api/admissions` crea el caso y ejecuta el pipeline completo.
- Los 5 escenarios producen su resultado esperado, verificado por tests, por
  llamadas HTTP reales y en el navegador.
- La reevaluación por evidencia funciona: un caso RED completo genera 22
  eventos y conserva la decisión anterior.
- El Safety Gate corrige a un modelo adversario que insiste en aprobarlo todo.
- Un fallo de IA (timeout, JSON inválido, excepción del SDK) no rompe nada.
- Notificación simultánea a los dos destinatarios.
- `GET /api/health` reporta honestamente qué está conectado.

### Qué falta
- Despliegue en Vercel (acción humana #2).
- Supabase real: el código está listo, nunca se ha ejecutado contra una
  instancia real. **Riesgo: medio-bajo.**
- Gemini real: la integración está escrita y validada por esquema, pero no ha
  hecho una sola llamada real. **Riesgo: medio.**
- ~~`RESOLVED` sin endpoint~~ ✅ entregado: `POST /api/cases/:id/resolve`
  (DEC-011). El backend ya no tiene huecos funcionales.

### Archivos modificados
Todo el repositorio. Origen del proyecto.

### Próximo paso exacto
Aplicar en el SQL Editor de Supabase, en este orden:
`supabase/migrations/20260919000001_init_schema.sql`,
`supabase/migrations/20260919000002_rls_policies.sql`, `supabase/seed.sql`.
Después cargar las 3 variables en Vercel, redesplegar y correr
`npm run verify:deployment -- <url>`.

### Tests
**94 passing · 0 failing.** `npm run verify` limpio, CI verde.
`npm run verify:deployment -- https://scayl-pulse.vercel.app` → **12/12 contra producción con Supabase real**.

### Bugs conocidos
Ninguno abierto.

### Riesgos
1. **Gemini nunca se ha llamado de verdad.** El esquema de salida estructurada
   puede necesitar ajustes menores contra la API real. *Mitigado:* si falla,
   el fallback determinístico mantiene los tres escenarios correctos, así que
   la demo no se cae — pero perderíamos la parte de IA del relato y, sobre
   todo, las métricas reales para el PDF. **Priorizar la clave de Gemini.**
2. **Supabase nunca se ha ejecutado de verdad.** El mapeo snake_case ↔ camelCase
   es la superficie con más probabilidad de tener un error. *Mitigado:* el
   repositorio in-memory permite demostrar sin Supabase, y `verify:deployment`
   detecta el fallo en segundos si lo hay.
5. **El repositorio en memoria no sirve para producción real en Vercel:** cada
   instancia serverless tiene su propia memoria y se recicla. Para la demo
   funciona; un caso creado puede no aparecer en una petición posterior si
   Vercel levanta otra instancia. **Razón de peso para terminar Supabase.**
3. **Fecha de entrega ambigua** (23 vs. 27 de septiembre). Trabajamos contra el
   23. *Mitigación: confirmar con la organización cuanto antes.*
4. **El repositorio está privado.** Si se entrega así, el jurado no puede abrir
   el entregable #1. Marcado como acción humana #1.

### Preguntas abiertas
- ~~¿Un caso `RESOLVED` debe poder reabrirse?~~ Resuelto en DEC-011: es
  terminal. Un expediente cerrado es un registro de auditoría; si aparece
  información nueva, lo correcto es abrir un caso nuevo que lo referencie.

---

## Workstream B — Frontend · `workstream/frontend`

**Fecha:** 2026-09-21
**Último commit de implementación:** `4a1c2ba` — `feat: complete frontend workstream`.
**Sincronización:** `8ab0f9e` incorpora `origin/main` sin conflictos.

**Qué funciona:** dashboard, búsqueda/filtros, detalle, vistas hospital y
aseguradora, simulador, ingreso libre con documentos, evidencia y reevaluación,
timeline por `seq`, decisiones históricas, panel auditable, resumen bajo demanda
y cierre humano. Se distinguen la corrección del Safety Gate, documentos
obligatorios/recomendados y fuentes de IA. Realtime tiene alternativa por polling.

**Qué falta:** revisión humana de la entrega y comprobación con Supabase
Realtime real. La suite de frontend aún no está incluida en el CI compartido;
su comando y recorrido de navegador están en
`src/components/frontend-tests/README.md`.

**Archivos modificados:** `src/app/page.tsx`, `src/app/globals.css`,
`src/components/ScenarioRunner.tsx`; nuevos `AdmissionForm.tsx`, `CaseDetail.tsx`,
`DecisionPanel.tsx`, `PulseDashboard.tsx`, `case-api.ts`,
`src/hooks/useCaseFeed.ts` y seis archivos en `src/components/frontend-tests/`.
Documentación: solo la sección B de `STATUS.md` y `HANDOFF.md` y el registro
propio en `AI_USAGE_LOG.md`. Sin cambios propios en backend, contratos,
`AGENTS.md` ni archivos del Workstream C.

**Próximo paso exacto:** Carlos/equipo debe revisar el diff de
`workstream/frontend` contra `main` y aprobar la interfaz antes de fusionar.

**Tests passing:** 108 del repositorio tras incorporar `main` + 13 de frontend.
**Tests failing:** 0. Typecheck y lint correctos. Build y recorrido de navegador
local aprobados el 2026-09-21, sin llamadas a Supabase/Gemini reales.
El recorrido cubre GREEN, YELLOW con dos aportaciones, RED con historial,
resumen bajo demanda, cierre terminal, ingreso libre, recarga, teclado y responsive.
**Bugs conocidos:** ninguno bloqueante detectado en los recorridos ejecutados;
la comprobación adicional de búsqueda/filtros y errores en navegador fue
interrumpida por petición de Carlos. Hay revisión de código y tests unitarios
de errores HTTP, presentación y actualización del expediente.
**Riesgos:** Realtime está probado con cliente simulado, no con Supabase real;
el build descarga Geist de Google Fonts y requiere conectividad. Las vistas
hospital/aseguradora son de demostración, sin autenticación, según el alcance MVP.

**Validación humana:** Carlos autorizó el alcance y la publicación de su parte;
no se registra como realizada una revisión humana de código o UX aún pendiente.

---

## Workstream C — Integrations / Demo / QA · `workstream/integrations`

**Fecha:** 2026-09-20
**Último commit:** consultar `git log -1 --oneline` en `workstream/integrations`;
esta entrega: `test: cover integrations HTTP flows and concurrent admissions`.

**Qué funciona:** el esquema ya está aplicado y verificado en el proyecto
`Pulse` (9 tablas, RLS activo en todas, Realtime publicando `cases` y
`case_events`, semillas cargadas: 3 hospitales, 4 pacientes, 4 pólizas, 4
antecedentes). La inmutabilidad del timeline está comprobada contra Postgres,
no solo en memoria.

⚠️ **Al limpiar datos de demo usa `TRUNCATE`, nunca `DELETE`.** Un
`delete from cases` falla: la cascada hacia `case_events` choca con el trigger
append-only y aborta el borrado entero. Es intencional (ver DEC-008).

**Qué funciona en local:** 14 tests HTTP nuevos con servidor Next propio,
sin credenciales. Los cinco escenarios pasan tanto por `/api/admissions`
con evidencia posterior como por el runner de demo. Se verifican historial
intacto, secuencias por caso, notificaciones duales, errores 422/404/409,
cierre terminal y 20 ingresos concurrentes con evidencia aislada.

**Qué falta:** recorrido visual y revisión humana del guion con Sebastián y
Carlos; valorar más escenarios solo si aportan a la demo. No se modificó el
frontend, el backend ni el contrato de API.

⚠️ **No intentes las tareas que necesitan Supabase o Gemini**: esas cuentas son
personales de Anthony y no tendrás acceso. Ya están hechas y verificadas por
el Workstream A — esquema aplicado, trigger append-only comprobado contra
Postgres, Gemini integrado y medido. Todo tu trabajo restante se puede hacer
en local sin una sola credencial.
**Archivos modificados:** `tests/e2e/http.test.ts`,
`tests/e2e/local-server.ts`, `tests/qa/assert-case.ts`,
`docs/DEMO_SCENARIOS.md`, `docs/TEST_PLAN.md`, sección C de `docs/STATUS.md`
y `docs/HANDOFF.md`, entrada de sesión en `docs/AI_USAGE_LOG.md`.
**Próximo paso exacto:** Sebastián y Carlos deben ejecutar YELLOW desde la
interfaz y comprobar que las tres decisiones permanecen visibles.
**Tests passing:** 108 · **Tests failing:** 0. `npm run verify` correcto.
Base inicial: 94 tests, typecheck y lint correctos.
**Bugs conocidos:** no se detectaron fallos de API en los flujos probados.
El guion prometía `gateOverrode: true` sin condicionarlo a la respuesta;
corregido para no atribuir una corrección al modelo en modo determinístico.
**Riesgos:** la carga valida funcionalidad en memoria, no capacidad de
producción ni concurrencia en Postgres. Ejecutar una suite HTTP por checkout
porque Next usa `.next/dev`. Next también añade automáticamente un bloque
administrado a `AGENTS.md` al arrancar; se retiró únicamente ese cambio
generado antes del commit, conservando las instrucciones originales.
**Validación humana:** pendiente; Sebastián autorizó alcance y clonación,
pero no ha revisado los resultados ni hecho el recorrido visual.

---

## Cambios transversales

Si modificaste un archivo que pertenece a otro workstream, regístralo aquí:
qué archivo, de quién es, qué cambiaste y por qué era necesario.
Commit con prefijo `cross:`.

| Fecha | Quién | Archivo | De quién | Por qué |
|---|---|---|---|---|
| 2026-09-21 | Claude Code (A) | `docs/STATUS.md` (sección C) | Workstream C | Se retiró la ruta local `C:/Users/Cbast/...` que el secret scan encontró antes de publicar: es el nombre de usuario y el disco de la máquina de un compañero, en un documento que el jurado puede leer. Solo esa línea. |
| 2026-09-21 | Claude Code (A) | `src/data/synthetic/scenarios.ts` | Workstream C | Solo los cinco `title`. Empezaban por «GREEN — », «YELLOW — »… y un jurado no conoce esa convención; además la insignia de color ya muestra el código, así que el prefijo era ruido duplicado. Ningún `id`, `expectedStatus`, dato ni fixture cambió: los tests de C siguen pasando sin tocarlos. |
