# HANDOFF

Continuidad entre sesiones. **Cada workstream mantiene su propia sección.**
Rellénala antes de detenerte, siempre — incluso si la sesión fue corta.

---

## ⚠️ Acciones humanas pendientes

Cosas que **un agente no puede hacer** y que bloquean entregables.

| # | Acción | Quién | Estado |
|---|---|---|---|
| 1 | **Hacer público el repositorio** antes de entregar | Anthony | ⬜ pendiente · bloquea el entregable #1 |
| 2 | Desplegar en Vercel | Anthony | ✅ proyecto `scayl-pulse` en el equipo `HACKS`, importado desde GitHub · falta pegar la URL aquí y en el README |
| 3 | Aplicar el esquema en Supabase | Anthony | ✅ hecho y **verificado contra Postgres 17** (proyecto `Pulse`, ref `yextrojwkgdyefkxbsne`) |
| 4 | Cargar las 3 variables de Supabase en Vercel | Anthony | ⬜ pendiente |
| 5 | Obtener `GEMINI_API_KEY` en https://aistudio.google.com/apikey | Anthony | ⬜ pendiente · bloquea las métricas del PDF |
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
- `RESOLVED` está en la máquina de estados pero ningún endpoint lo produce
  todavía. Falta `POST /api/cases/:id/resolve` para el cierre manual por parte
  de un gestor.

### Archivos modificados
Todo el repositorio. Origen del proyecto.

### Próximo paso exacto
Aplicar en el SQL Editor de Supabase, en este orden:
`supabase/migrations/20260919000001_init_schema.sql`,
`supabase/migrations/20260919000002_rls_policies.sql`, `supabase/seed.sql`.
Después cargar las 3 variables en Vercel, redesplegar y correr
`npm run verify:deployment -- <url>`.

### Tests
**48 passing · 0 failing.** `npm run verify` limpio.
`npm run verify:deployment` → 12/12 contra un build de producción local.

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
- ¿Un caso `RESOLVED` debe poder reabrirse? Ahora mismo es terminal y rechaza
  evidencia nueva con `409`. Parece correcto, pero conviene confirmarlo con el
  planteamiento del reto.

---

## Workstream B — Frontend · `workstream/frontend`

**Fecha:** —
**Último commit:** —

**Qué funciona:** —
**Qué falta:** todo el dashboard. Punto de partida: `docs/API_CONTRACT.md`.
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

**Qué falta:** QA end-to-end, tests de integración HTTP, validación del
despliegue con Supabase conectado. Punto de partida: `docs/DEMO_SCENARIOS.md`
y `docs/TEST_PLAN.md`.
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
