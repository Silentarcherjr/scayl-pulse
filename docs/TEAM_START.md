# Arranque del equipo — léeme primero

Cuatro pasos y a trabajar. No hace falta reunión previa.

---

## 1. Conecta GitHub en Codex

Repositorio: **`Silentarcherjr/scayl-pulse`**
→ https://github.com/Silentarcherjr/scayl-pulse

Si no te aparece, pídele a Anthony que te invite como colaborador.

## 2. Abre el repositorio

```bash
git clone https://github.com/Silentarcherjr/scayl-pulse.git
cd scayl-pulse
npm install
```

## 3. Cámbiate a tu rama

**Carlos González — Frontend:**
```bash
git checkout workstream/frontend
```

**Sebastián Sánchez — Integraciones / Demo / QA:**
```bash
git checkout workstream/integrations
```

> Si prefieren intercambiarse, no hay que cambiar nada en el repositorio: el
> rol lo determina la rama, no el nombre.

**Nunca trabajes en `main`.**

## 4. Dile a Codex

> **«Lee AGENTS.md y procede con mi workstream.»**

Y ya está. `AGENTS.md` detecta tu rama, te asigna el workstream, te dice qué
carpetas son tuyas, cuáles no puedes tocar, qué leer y cómo cerrar la sesión.

---

## No necesitas credenciales. De verdad.

Vercel, Supabase y Gemini están en las cuentas personales de Anthony y **no
vas a tener acceso**. No lo necesitas: el proyecto está construido para
funcionar entero sin ninguna variable de entorno (ver DEC-005).

Verificado sobre un clon limpio y sin credenciales:

| | |
|---|---|
| `npm run verify` — 87 tests | ✅ |
| Crear casos por el pipeline completo | ✅ |
| Panel de comprobaciones `decision.checks` | ✅ |
| Resumen del gestor `/api/cases/:id/summary` | ✅ versión determinística |
| Supabase Realtime | ❌ requiere la clave anon |
| Narrativa escrita por Gemini | ❌ sale la determinística, marcada como tal |

Las dos últimas **no te bloquean**: el código tiene camino alternativo para
ambas y `GET /api/health` te dice en todo momento qué está activo. Si quieres
probar contra datos reales, usa el despliegue: **https://scayl-pulse.vercel.app**

Si necesitas Realtime de verdad, pídele a Anthony la `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
es pública por diseño (viaja en el bundle del navegador) y solo concede
lectura. **La `SUPABASE_SERVICE_ROLE_KEY` no, esa es secreta y no la necesitas.**

## Comprueba que todo funciona antes de empezar

```bash
npm run verify     # typecheck + lint + 42 tests → todo en verde
npm run dev        # http://localhost:3000
```

**No necesitas ninguna credencial.** El backend ya funciona sin Supabase y sin
Gemini; la demo completa es reproducible tal cual.

Crea casos reales de prueba en un segundo:
```bash
curl -s -X POST localhost:3000/api/demo/scenarios/green-verified/run -H 'content-type: application/json' -d '{}' | jq
curl -s -X POST localhost:3000/api/demo/scenarios/red-human-review/run -H 'content-type: application/json' -d '{"applyFollowUps":true}' | jq
```

---

## Lo mínimo que tienes que saber del producto

SCAYL Pulse abre un **expediente vivo** cuando un hospital registra un ingreso
a emergencias. Valida la póliza, revisa preexistencias, analiza la evidencia
con IA, aplica un **Safety Gate determinístico** y notifica a la vez al
hospital y a la aseguradora. Cuando llega evidencia nueva, el caso se
reevalúa solo y **las decisiones anteriores no se borran**.

Tres reglas que nunca se rompen:

1. El sistema **no diagnostica** y **no puede impedir la atención de emergencia**.
2. **Las reglas determinísticas mandan sobre el LLM.** Siempre.
3. **Solo datos sintéticos.** Nunca información médica real.

Y una regla de equipo:

4. **¿Se te ocurre una idea nueva de producto? No la implementes.** Anótala en
   `docs/IDEAS.md` como `PROPOSED`. Solo una persona la aprueba.

---

## Tu primera sesión, en concreto

### Carlos González — Workstream B (Frontend)

Lee `docs/API_CONTRACT.md` completo. Es tu contrato: tiene todas las
respuestas con ejemplos, así que **no necesitas preguntarle nada al backend**.

Lo primero que aporta valor real:

1. **Lista de casos** — `GET /api/cases`. Estado, hospital, motivo, si
   requiere humano.
2. **Detalle de caso** — `GET /api/cases/:id`. La decisión con su motivo,
   evidencia y documentos faltantes.
3. **Timeline** — `GET /api/cases/:id/events`. **Ordena por `seq`, nunca por
   `createdAt`.** Es la pieza que demuestra el expediente vivo: no la dejes
   para el final.
4. **Simulador de ingreso** — `GET /api/demo/scenarios` y
   `POST /api/demo/scenarios/:id/run`. Botones GREEN / YELLOW / RED.

Tres detalles que valen puntos con el jurado:
- Cuando `decision.gateOverrode === true`, **enséñalo**: el Safety Gate
  corrigió al modelo.
- Distingue `BLOCKING` de `ADVISORY` en los documentos faltantes.
- Si `decision.source === 'AI_UNAVAILABLE'`, dilo con honestidad.

### Sebastián Sánchez — Workstream C (Integraciones / Demo / QA)

Lee `docs/DEMO_SCENARIOS.md` y `docs/TEST_PLAN.md`.

**Ya está hecho y NO tienes que rehacerlo** (requería credenciales que no
tienes): el esquema está aplicado y verificado contra Postgres 17, el trigger
append-only está comprobado —rechaza `UPDATE` y `DELETE` de verdad— y Gemini
está integrado y midiendo en producción. Los resultados están en
`docs/AI_USAGE_LOG.md` y en `DECISIONS.md` (DEC-008).

Lo primero que aporta valor real, **todo posible sin credenciales**:

1. **Verifica los cinco escenarios a mano** contra `docs/DEMO_SCENARIOS.md` y
   anota cualquier discrepancia entre lo que dice el doc y lo que hace el
   sistema. Puedes hacerlo en local y también contra
   https://scayl-pulse.vercel.app
2. **Tests de integración HTTP** sobre las rutas (`tests/e2e/`). Hoy los tests
   llaman al orquestador directamente; falta cubrir el borde HTTP: envelope de
   respuesta, códigos 422/404/409/429, y el contrato de `/api/cases/:id`.
3. **Enriquece el dataset sintético** — más pacientes, más pólizas, más
   antecedentes, más relaciones en la tabla clínica. Si tocas
   `src/data/synthetic/reference-data.ts`, refleja lo mismo en
   `supabase/seed.sql` (Anthony lo aplicará), y **nunca hardcodees fechas
   absolutas**: caducan y rompen la demo el día de la entrega.
4. **Escenarios nuevos** que expongan reglas aún no demostradas: plan sin
   cobertura de emergencias, ingreso dentro del período de carencia, póliza de
   otro asegurado. Cada escenario nuevo necesita su `expectedStatus` y su test.
5. **Prueba de carga ligera** en local: 20 ingresos concurrentes sin colisión
   de `seq` ni fugas entre casos.

⚠️ El endpoint de demo tiene un tope de casos (`429` al llegar a 200). En
local nunca lo alcanzarás; en el despliegue, si lo alcanzas, avisa a Anthony
para que reinicie los datos.

---

## Antes de cerrar cualquier sesión

```bash
npm run verify
```

Luego:
1. `docs/STATUS.md` — tu sección;
2. `docs/HANDOFF.md` — tu sección (**el próximo paso exacto**, no «seguir con el frontend»);
3. `docs/AI_USAGE_LOG.md` — dos o tres líneas concretas de qué hizo Codex y qué corregiste tú. Esto alimenta un entregable obligatorio del reto, y no se puede reconstruir el último día;
4. commit y `git push origin <tu-rama>`.

**Nunca `git push --force`.**

---

## ¿Dudas?

En este orden: `AGENTS.md` → `docs/API_CONTRACT.md` → `docs/ARCHITECTURE.md`
→ `docs/DECISIONS.md`.

Si sigue sin estar claro, **no lo adivines**: anótalo como pregunta abierta en
`docs/HANDOFF.md` y sigue con lo que sí puedas hacer. Una suposición
silenciosa sobre un contrato es lo que hace que dos workstreams no encajen el
último día.

---

**Deadline operativo: 23 de septiembre de 2026, 23:59.** Ver
`docs/HACKATHON_RULES.md` — hay una inconsistencia en las bases y tomamos la
fecha más conservadora.
