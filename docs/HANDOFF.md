# HANDOFF

Continuidad entre sesiones. **Cada workstream mantiene su propia sección.**
Rellénala antes de detenerte, siempre — incluso si la sesión fue corta.

---

## ⚠️ Acciones humanas pendientes

Cosas que **un agente no puede hacer** y que bloquean entregables.

| # | Acción | Quién | Estado |
|---|---|---|---|
| 1 | **Hacer público el repositorio** antes de entregar | Anthony | ⬜ pendiente · bloquea el entregable #1 |
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

**2 · Verificar el despliegue**
```bash
npm run verify:deployment -- https://<tu-url>.vercel.app
```

**Desde el móvil, sin computadora:** las sesiones en la nube tienen el tráfico
limitado por allowlist y **no alcanzan Vercel ni Supabase** (sí GitHub, npm y
Gemini). Para verificar producción desde donde estés, lanza el workflow
**«Verificar producción»** desde la pestaña Actions de GitHub: corre las mismas
12 comprobaciones desde un runner con salida libre.

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
**87 passing · 0 failing.** `npm run verify` limpio, CI verde.
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

**Fecha:** —
**Último commit:** —

**Qué funciona:** el backend entero, desplegado y con contrato cerrado.
**Qué falta:** todo el dashboard. Punto de partida: `docs/API_CONTRACT.md`.

**Dos ideas aprobadas que te tocan a ti:**
- **IDEA-006** — el panel «¿Por qué tomó esta decisión?». El backend ya te da
  `decision.checks` con las doce comprobaciones, su estado, su evidencia y el
  suelo que imponen. Solo hay que pintarlo: ✓ ⚠ ✕ —. Está en el contrato con
  ejemplo. **Es lo que convierte esto en IA auditable; priorízalo.**
- **IDEA-004** — formulario de ingreso libre contra `POST /api/admissions`,
  para que un evaluador escriba su propio caso.
- **IDEA-003 ya está en el backend**: `GET /api/cases/:id/summary`. Llámalo
  desde un botón explícito, no al cargar la página: la primera generación
  tarda ~10 s y las siguientes vienen de caché en menos de 1 s.

**Archivos modificados:** —
**Próximo paso exacto:** lista de casos contra `GET /api/cases`.
**Tests passing:** — · **Tests failing:** —
**Bugs conocidos:** —
**Riesgos:** —

---

## Workstream C — Integrations / Demo / QA · `workstream/integrations`

**Fecha:** —
**Último commit:** —

**Qué funciona:** el esquema ya está aplicado y verificado en el proyecto
`Pulse` (9 tablas, RLS activo en todas, Realtime publicando `cases` y
`case_events`, semillas cargadas: 3 hospitales, 4 pacientes, 4 pólizas, 4
antecedentes). La inmutabilidad del timeline está comprobada contra Postgres,
no solo en memoria.

⚠️ **Al limpiar datos de demo usa `TRUNCATE`, nunca `DELETE`.** Un
`delete from cases` falla: la cascada hacia `case_events` choca con el trigger
append-only y aborta el borrado entero. Es intencional (ver DEC-008).

**Qué falta:** QA end-to-end, tests de integración HTTP sobre las rutas,
escenarios adicionales y dataset más rico. Punto de partida:
`docs/DEMO_SCENARIOS.md` y `docs/TEST_PLAN.md`.

⚠️ **No intentes las tareas que necesitan Supabase o Gemini**: esas cuentas son
personales de Anthony y no tendrás acceso. Ya están hechas y verificadas por
el Workstream A — esquema aplicado, trigger append-only comprobado contra
Postgres, Gemini integrado y medido. Todo tu trabajo restante se puede hacer
en local sin una sola credencial.
**Archivos modificados:** —
**Próximo paso exacto:** ejecutar los 5 escenarios a mano y anotar cualquier
discrepancia con `DEMO_SCENARIOS.md`.
**Tests passing:** — · **Tests failing:** —
**Bugs conocidos:** —
**Riesgos:** —

---

## Cambios transversales

Si modificaste un archivo que pertenece a otro workstream, regístralo aquí:
qué archivo, de quién es, qué cambiaste y por qué era necesario.
Commit con prefijo `cross:`.

| Fecha | Quién | Archivo | De quién | Por qué |
|---|---|---|---|---|
| — | — | — | — | — |
