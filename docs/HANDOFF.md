# HANDOFF

Continuidad entre sesiones. **Cada workstream mantiene su propia sección.**
Rellénala antes de detenerte, siempre — incluso si la sesión fue corta.

---

## ⚠️ Acciones humanas pendientes

Cosas que **un agente no puede hacer** y que bloquean entregables.

| # | Acción | Quién | Bloquea |
|---|---|---|---|
| 1 | **Hacer público el repositorio** antes de entregar | Anthony | Entregable #1 |
| 2 | **Desplegar en Vercel** y pegar la URL aquí y en el README | Anthony | Entregable #2 |
| 3 | Crear proyecto Supabase y poner las 3 claves en Vercel + `.env.local` | Anthony | Persistencia real, Realtime |
| 4 | Obtener `GEMINI_API_KEY` en https://aistudio.google.com/apikey | Anthony | Métricas reales de IA para el PDF |
| 5 | **Confirmar con la organización la fecha real de entrega** (23 vs. 27 de septiembre) | Anthony | Planificación del equipo |
| 6 | Invitar a Carlos y Sebastián como colaboradores del repositorio | Anthony | Que puedan trabajar |

### Comandos exactos para cada una

**1 · Hacer público el repositorio**
```bash
gh repo edit Silentarcherjr/scayl-pulse --visibility public --accept-visibility-change-consequences
```

**2 · Desplegar en Vercel**
```bash
npx vercel link
npx vercel --prod
```
La aplicación **funciona desplegada sin ninguna variable de entorno** (usará
repositorio en memoria y analizador determinístico). Se puede desplegar hoy y
añadir las claves después.

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
**Sesión:** bootstrap completo del proyecto (Claude Code, Opus 5)

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
```bash
npx vercel link && npx vercel --prod
```
Luego pegar la URL en `README.md` y en `docs/STATUS.md`, y commitear.

### Tests
**42 passing · 0 failing.** `npm run verify` limpio.

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
   repositorio in-memory permite demostrar sin Supabase.
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

**Qué funciona:** —
**Qué falta:** QA end-to-end, tests de integración HTTP, validación contra
Supabase real. Punto de partida: `docs/DEMO_SCENARIOS.md` y `docs/TEST_PLAN.md`.
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
