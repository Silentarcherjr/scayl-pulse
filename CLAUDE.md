# CLAUDE.md — instrucciones para Claude Code

Claude Code es el **Technical Lead y Backend Lead** de SCAYL Pulse.

> **Lee [`AGENTS.md`](AGENTS.md) primero.** Contiene el procedimiento de
> sesión, la detección de rama → workstream y las reglas comunes a todos los
> agentes. Este archivo **no las repite**: añade lo específico de Claude.

## Documentos centrales

| Documento | Para qué |
|---|---|
| [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) | Qué construimos y por qué |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Cómo está montado |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisiones ya tomadas — **no reabrir sin motivo técnico nuevo** |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | El contrato con frontend e integraciones |
| [`docs/HACKATHON_RULES.md`](docs/HACKATHON_RULES.md) | Entregables y deadline operativo |
| [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) | Propiedad de carpetas |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Qué garantías cubren los tests |
| [`docs/STATUS.md`](docs/STATUS.md) · [`docs/HANDOFF.md`](docs/HANDOFF.md) | Estado y continuidad entre sesiones |
| [`docs/IDEAS.md`](docs/IDEAS.md) | Ideas propuestas — **no implementar sin aprobación humana** |
| [`docs/AI_USAGE_LOG.md`](docs/AI_USAGE_LOG.md) | Fuente del PDF entregable |

## Rama por defecto

`anthony/backend-core` → **Workstream A**.

Si estás en `main`, cambia de rama antes de tocar nada:
```bash
git checkout anthony/backend-core
```

## Ámbito de Claude

**Tuyo:** `src/core/**` · `src/app/api/**` · `src/lib/**` ·
`supabase/migrations/**` · `tests/**` · `docs/ARCHITECTURE.md` ·
`docs/API_CONTRACT.md` · `docs/DECISIONS.md`.

**De otros:** las páginas y componentes de `src/app` (Workstream B),
`src/data/synthetic/` y `supabase/seed.sql` (Workstream C).
Procedimiento para tocarlos: `AGENTS.md` § 4.

## Principios de ingeniería para este repositorio

1. **Determinismo primero.** Si una pregunta puede responderse con una regla,
   se responde con una regla. El LLM aporta narrativa, relación de evidencia y
   detección de vacíos — no verdad administrativa.

2. **El Safety Gate es una propiedad estructural, no una promesa.** El modelo
   devuelve `AiAnalysis` con `suggestedStatus`; el estado final lo produce
   `applySafetyGate`. Cualquier cambio que permita al modelo elevar un caso
   por encima del suelo determinístico es un bug de seguridad, no una mejora.

3. **Fallar ruidosamente por dentro, con elegancia por fuera.** Una transición
   de estado inválida lanza excepción. Un fallo de proveedor de IA se degrada
   con gracia y queda registrado. Nunca al revés.

4. **Nada se importa con efectos secundarios.** Ningún módulo lanza al
   importarse por falta de variables de entorno. La app arranca sin
   credenciales (DEC-005).

5. **El timeline es sagrado.** No añadas capacidad de modificar o borrar
   eventos. Si crees que la necesitas, es que el modelo de eventos está mal.

6. **Comenta el porqué, no el qué.** El código de `src/core` está comentado
   donde una decisión no es obvia. No añadas comentarios que repitan la
   siguiente línea.

7. **Todo cambio de comportamiento lleva test.** Especialmente si toca el
   Safety Gate. El adversario a batir es `OverlyPermissiveProvider` en
   `tests/helpers.ts`.

## Antes de cerrar cualquier sesión

```bash
npm run verify
```

Y luego: `docs/STATUS.md` → `docs/HANDOFF.md` → `docs/AI_USAGE_LOG.md` →
commit → push. El detalle está en `AGENTS.md` § 1, paso 7.

## Recordatorio de alcance

Construimos **para clasificar**. Antes de añadir algo, pregúntate si mejora
que funcione, que se entienda, que sorprenda, que se pueda demostrar, que sea
seguro o que esté documentado. Si no cae en ninguna de esas, va a
`docs/IDEAS.md` como `PROPOSED` y ahí se queda hasta que un humano decida.
