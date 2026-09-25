# Escenarios de demostración

Los escenarios se ejecutan **a través del pipeline real**: el mismo
orquestador, el mismo analizador y el mismo Safety Gate que atiende un webhook
hospitalario. No hay mocks en el camino de la demo.

Definición: [`src/data/synthetic/scenarios.ts`](../src/data/synthetic/scenarios.ts)

Todos los datos son sintéticos (DEC-002).

---

## Cómo ejecutarlos

**Desde la interfaz:** abre la página principal y pulsa el escenario.

**Desde la terminal:**
```bash
curl -s -X POST localhost:3000/api/demo/scenarios/green-verified/run \
  -H 'content-type: application/json' -d '{"applyFollowUps":true}' | jq
```

**Desde los tests:**
```bash
npm test -- scenarios
```

---

## 🟢 GREEN — `green-verified`

**Esperado: `VERIFIED`**

| | |
|---|---|
| Paciente | María Gómez Salazar · 8-888-1111 |
| Póliza | POL-1001 · `ACTIVE` · SALUD-PLENA-300 |
| Hospital | HOSP-PTY-01 · en red |
| Motivo | Laceración profunda en antebrazo · `S51.8` · triaje `YELLOW` |
| Costo estimado | B/. 950 (por debajo del umbral de B/. 5 000) |
| Documentos | `ADMISSION_FORM`, `PATIENT_ID`, `TRIAGE_NOTE` |

**Por qué verifica.** Póliza vigente, hospital en red, documentación
obligatoria completa y ningún antecedente que la tabla clínica relacione con
una laceración. El suelo determinístico es `VERIFIED` y el modelo no aporta
motivo para endurecerlo.

**Qué mirar.** El timeline completo —ingreso, identificación, póliza,
historial, IA, Safety Gate, clasificación y **dos notificaciones
simultáneas**— en cuestión de segundos.

---

## 🟡 YELLOW — `yellow-documents-required`

**Esperado: `DOCUMENTS_REQUIRED` → (evidencia) → `VERIFIED`**

| | |
|---|---|
| Paciente | Luis Cedeño Ortega · 8-777-2222 |
| Póliza | POL-2002 · `ACTIVE` |
| Hospital | HOSP-PTY-02 · en red |
| Motivo | Dolor abdominal en fosa ilíaca derecha · `R10.3` · triaje `ORANGE` |
| Costo estimado | B/. 6 800 (**supera** el umbral) |
| Documentos | `ADMISSION_FORM`, `PATIENT_ID` |

**Por qué faltan documentos.** El triaje `ORANGE` exige `MEDICAL_REPORT`; el
costo por encima de B/. 5 000 exige además `COST_ESTIMATE`. Ninguno llegó.

**El agente dice exactamente qué falta y por qué**, no «falta documentación»:

- `MEDICAL_REPORT` — obligatorio: el costo estimado supera el umbral y exige informe médico.
- `COST_ESTIMATE` — obligatorio: los casos por encima de B/. 5 000 requieren estimado para autorización.

**Reevaluación.**

| Paso | Evidencia aportada | Resultado |
|---|---|---|
| 1 | — | `DOCUMENTS_REQUIRED` |
| 2 | `MEDICAL_REPORT` | `DOCUMENTS_REQUIRED` (aún falta el estimado) |
| 3 | `COST_ESTIMATE` | **`VERIFIED`** |

El paso 2 es deliberado: demuestra que el sistema **no se conforma** con una
evidencia parcial.

---

## 🔴 RED — `red-human-review`

**Esperado: `HUMAN_REVIEW` → (informe de cardiología) → `VERIFIED`**

| | |
|---|---|
| Paciente | Ana Batista Rivera · 8-666-3333 |
| Póliza | POL-3003 · `ACTIVE` · inicio hace 90 días · carencia 60 días |
| Hospital | HOSP-PTY-01 · en red |
| Motivo | Dolor torácico opresivo irradiado a brazo izquierdo · `R07.9` · triaje `RED` |
| Costo estimado | B/. 12 400 |
| Documentos | Los cinco requeridos, todos presentes |
| Antecedente | `I10` Hipertensión arterial esencial, diagnosticada hace 420 días |

**Por qué escala a revisión humana.** No falta ningún documento y la póliza
está vigente. El conflicto es otro: el antecedente de hipertensión fue
diagnosticado **330 días antes** del inicio de la póliza, y la tabla clínica
declara `R07.9 → I10` como potencialmente relacionados. Ningún documento del
expediente aclara esa relación.

El sistema **no decide**. Escala mostrando:

- **evidencia** — la entrada `mh-003` con código, etiqueta, fecha y fuente;
- **motivo** — `[PRE_EXISTING_UNRESOLVED]` con la explicación completa;
- **incertidumbre** — pregunta abierta sobre la relación entre el antecedente y el ingreso;
- **acción recomendada** — asignar a un gestor humano;
- **y una línea que nunca falta:** la atención de emergencia no se detiene por esta revisión.

**Reevaluación.** Cardiología aporta un `SPECIALIST_REPORT` que documenta que
la hipertensión fue declarada en la suscripción y aceptada sin exclusión. El
antecedente queda **aclarado por evidencia** y el caso pasa a `VERIFIED`. La
decisión anterior sigue en el timeline.

---

## ⚪ EXTRA — controles de seguridad

Escenarios adicionales que demuestran el Safety Gate de forma directa.

### `extra-expired-policy` → `HUMAN_REVIEW`
Póliza vencida hace 60 días, todo lo demás perfecto. **Nunca puede alcanzar
`VERIFIED`.** Con un modelo que proponga `VERIFIED`, el Gate lo corrige y
`gateOverrode` queda en `true`. Es el escenario que mejor demuestra que el
LLM no manda.

### `extra-out-of-network` → `HUMAN_REVIEW`
Póliza vigente, hospital fuera de red. Escala por vía administrativa sin
afectar en nada la atención del paciente.

---

## Guion sugerido de demostración (3 minutos)

1. **GREEN** (30 s) — «un ingreso limpio se resuelve solo, y notifica a las dos
   partes a la vez». Mostrar el timeline.
2. **YELLOW** (45 s) — «cuando falta algo, no dice *falta documentación*: dice
   qué documento y por qué». Adjuntar los documentos en vivo y ver cómo el
   caso se reevalúa hasta `VERIFIED`.
3. **RED** (60 s) — «aquí el sistema **se detiene**». Mostrar evidencia,
   motivo, incertidumbre y la línea de que la atención no se interrumpe.
   Adjuntar el informe de cardiología y ver el cambio a `VERIFIED` **con la
   decisión anterior todavía visible**.
4. **EXTRA / póliza vencida** (30 s) — mostrar `POLICY_EXPIRED` y
   `HUMAN_REVIEW`. Solo explicar una corrección al modelo si la respuesta
   contiene `gateOverrode: true`: el modo determinístico no garantiza ese valor.
5. **Cierre** (15 s) — `GET /api/health`: la demo es honesta sobre qué está
   corriendo.

---

## Robustez

- Los escenarios son **determinísticos**: las fechas se calculan relativas a
  hoy, así que nunca caducan.
- Si Gemini falla (timeout, rate limit, caída), **los tres escenarios siguen
  dando el resultado esperado**, decididos por reglas. Hay un test que lo
  verifica escenario por escenario.
- El fallback se identifica siempre como `deterministic-fallback` y la
  decisión queda marcada `source: "AI_UNAVAILABLE"`. **Nunca se falsifica una
  llamada a Gemini.**

## QA local de Integrations

```bash
npm test -- tests/e2e/http.test.ts
```

La suite inicia y detiene su propio servidor Next en un puerto local libre.
Fuerza persistencia en memoria y analizador de fixtures: no requiere claves,
no escribe en producción y las decisiones llevan `source: "DETERMINISTIC"`.
`AI_UNAVAILABLE` corresponde a un proveedor que se intentó usar y falló.

Verifica los cinco escenarios por dos vías: webhook de ingreso con evidencia
en peticiones separadas, y runner de demo con `applyFollowUps: true`.
Comprueba estados intermedios, decisiones anteriores intactas, orden por
`seq`, evidencia del propio caso y notificaciones a ambas partes con el aviso
de continuidad de atención. También cubre errores HTTP, cierre terminal y
20 ingresos concurrentes. Esto valida la API; el recorrido visual con Carlos González
y la revisión visual quedaron cubiertos por la auditoría de navegador contra
producción.
