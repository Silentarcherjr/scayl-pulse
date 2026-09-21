# Plan de pruebas

```bash
npm test              # suite completa
npm run test:watch    # durante el desarrollo
npm run test:coverage # cobertura de src/core
npm run verify        # typecheck + lint + tests  ← antes de cada push

npm run verify:deployment -- https://tu-despliegue.vercel.app
```

`verify:deployment` (`scripts/verify-deployment.mjs`) comprueba una URL ya
desplegada: salud del servicio, los cinco escenarios a través del pipeline
real, secuencia del timeline, notificación a ambos canales, rastro del Safety
Gate, y que una entrada inválida devuelva 422 en lugar de 500. Sale con código
distinto de cero si algo falla, así que sirve de puerta antes de una demo.

**Sin computadora a mano:** el mismo script corre como workflow manual
«Verificar producción» en la pestaña Actions de GitHub. Existe porque las
sesiones en la nube no alcanzan Vercel: su salida a internet está limitada por
allowlist a GitHub, npm y Gemini.

Los tests corren con `SCAYL_FORCE_IN_MEMORY=true` y
`SCAYL_FORCE_FIXTURE_AI=true` (ver `vitest.config.mts`): **nunca llaman a una
API de pago y son reproducibles en cualquier máquina**, con o sin credenciales.

---

## Garantías obligatorias

Cada fila es un requisito del reto o una propiedad de seguridad. Todas están
cubiertas.

| # | Garantía | Test | Archivo |
|---|---|---|---|
| 1 | Una póliza vencida **nunca** llega a `VERIFIED` | «una póliza vencida NUNCA produce VERIFIED…» | `safety-gate.test.ts` |
| 2 | Documento obligatorio ausente → `DOCUMENTS_REQUIRED` | «YELLOW: falta documentación obligatoria…» | `scenarios.test.ts` |
| 3 | Conflicto posible + evidencia insuficiente → `HUMAN_REVIEW` | «RED: preexistencia potencial sin evidencia suficiente…» | `scenarios.test.ts` |
| 4 | Nueva evidencia dispara reevaluación | «la nueva evidencia dispara REASSESSING…» | `timeline-and-isolation.test.ts` |
| 5 | Los case events son inmutables | 3 tests: superficie del puerto, eventos previos intactos, copias defensivas | `timeline-and-isolation.test.ts` |
| 6 | Una respuesta malformada de Gemini se maneja | 2 tests: JSON válido fuera de esquema, y no-JSON | `safety-gate.test.ts` |
| 7 | Un error de Gemini no rompe el procesamiento | 3 tests: timeout, excepción del SDK, y los 5 escenarios sin IA | `safety-gate.test.ts` |
| 8 | El LLM no puede saltarse el Safety Gate | 4 tests: vencida, preexistencia, documentos, baja confianza | `safety-gate.test.ts` |
| 9 | Los casos no filtran datos entre sí | «cada caso solo ve su propia evidencia, timeline y notificaciones» | `timeline-and-isolation.test.ts` |
| 10 | El timeline conserva las decisiones anteriores | «el timeline conserva todas las decisiones anteriores…» | `timeline-and-isolation.test.ts` |

## Cobertura adicional

**Reglas determinísticas** (`deterministic-rules.test.ts`) — vencimiento,
póliza de otro asegurado, fuera de red, período de carencia como advertencia y
no como bloqueo; requisitos documentales por costo y por triaje; detección de
preexistencias, resolución por código declarado, resolución por texto sin
acentos, y que un documento no resolutivo (un estimado de costos) **no**
aclara una preexistencia; máquina de estados.

**Escenarios** (`scenarios.test.ts`) — los tres obligatorios más los dos
extra, sus reevaluaciones y sus resultados esperados.

**Configuración** (`configuration.test.ts`) — la clave anon por sí sola no
habilita Supabase para escritura (el error más fácil de cometer al desplegar,
porque RLS solo concede lectura a anon); una variable vacía equivale a no
definida, que es como Vercel crea las detectadas en `.env.example`; los
interruptores `SCAYL_FORCE_*` ganan y lo explican en `/api/health`.

**Producto** — ninguna decisión afirma haber tomado una decisión médica; toda
notificación lleva la advertencia de que la atención no se interrumpe; las
citas de evidencia inventadas por el modelo se descartan.

---

## Dobles de prueba

En `tests/helpers.ts`, todos implementando `AiProvider`:

| Doble | Simula |
|---|---|
| `MalformedProvider` | JSON válido que no cumple el esquema, o HTML de un 502 |
| `FailingProvider` | Timeout / rate limit / caída del proveedor |
| `ThrowingProvider` | Un SDK que lanza excepción en vez de devolver error |
| `OverlyPermissiveProvider` | Un modelo seguro de sí mismo que dice «todo en orden» y cita registros inexistentes |

`OverlyPermissiveProvider` es el más importante: es el adversario contra el
que se prueba el Safety Gate.

---

## Qué falta (Workstream C)

- [x] Tests de integración HTTP con `fetch` contra un servidor `next dev`
      propio: `tests/e2e/http.test.ts`. Incluidos en `npm run verify`.
- [ ] Recorrido end-to-end de los tres escenarios desde la interfaz.
- [x] Supabase real: ya aplicado y verificado por Workstream A, según
      `HANDOFF.md`. No se repite desde Integrations ni se requieren sus claves.
- [x] Gemini real: integrado y medido por Workstream A, según
      `HANDOFF.md` y `AI_USAGE_LOG.md`. No se repite desde Integrations.
- [x] Carga ligera local: 20 ingresos HTTP concurrentes; IDs únicos, evidencia
      aislada, secuencias `1..n` por caso y notificaciones duales.

### Ejecutar la suite HTTP local

```bash
npm test -- tests/e2e/http.test.ts
```

Usa únicamente las dependencias existentes. El servidor escucha en
`127.0.0.1`, en un puerto libre, con `SCAYL_FORCE_IN_MEMORY=true` y
`SCAYL_FORCE_FIXTURE_AI=true`. Se detiene al terminar, también ante fallos.
El primer arranque compila las rutas y puede tardar hasta dos minutos.
Ejecutar una suite HTTP a la vez por checkout: Next comparte `.next/dev`.

Los 14 tests cubren catálogo/salud, los cinco escenarios tanto por webhook
como por runner, reevaluaciones, historial inmutable, notificaciones con
aviso administrativo, errores 422/404/409, cierre terminal y concurrencia.
Los helpers de `tests/qa/assert-case.ts` verifican secuencias y notificaciones.
La comprobación de carga es funcional; no mide capacidad de producción,
latencia de Gemini ni concurrencia contra Postgres.

## Qué falta (Workstream B)

- [ ] Tests de componentes de los estados de caso.
- [ ] Verificación de que la UI distingue `BLOCKING` de `ADVISORY`.
- [ ] Verificación de que la UI muestra `gateOverrode` cuando es `true`.
- [ ] Estados de error: API caída, caso inexistente, Realtime desconectado.
