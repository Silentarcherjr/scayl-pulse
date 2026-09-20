# SCAYL Pulse — especificación de producto

## El problema

Cuando un asegurado entra a una sala de emergencias, dos organizaciones
necesitan saber cosas distintas al mismo tiempo y ninguna las tiene:

- **El hospital** no sabe si la póliza cubre el ingreso. Admite igual —debe
  hacerlo— y descubre el problema administrativo días después, cuando ya es
  una disputa de facturación.
- **La aseguradora** se entera tarde. Cuando llega el expediente, el caso ya
  escaló en costo y nadie puede reconstruir qué se sabía en qué momento.

El resultado son semanas de ida y vuelta, reclamos rechazados a posteriori y
pacientes atrapados en medio de un problema que no es suyo.

## Lo que no estamos construyendo

**No es un chatbot.** Nadie le pregunta nada a SCAYL Pulse.

**No es un motor de decisión médica.** No diagnostica, no clasifica gravedad
clínica y no puede impedir que un paciente sea atendido.

**No es un clasificador de una sola pasada.** El problema real no es «¿está
cubierto?» en el minuto cero: es que la respuesta cambia conforme llega
información, y hoy nadie lleva ese registro.

## Lo que sí es: el expediente vivo de emergencia

*Live Emergency Case.*

Un expediente que se abre con el webhook de ingreso y **permanece vivo**.
Cada vez que llega nueva evidencia —un informe médico, un documento
administrativo, un resultado de laboratorio— el expediente se reevalúa solo, y
**todas las decisiones anteriores permanecen en el timeline**.

```
Admission Event
  ↓
Patient identification
  ↓
Policy validation            ← determinístico
  ↓
History / pre-existing       ← determinístico (tabla clínica declarada)
  ↓
AI evidence analysis         ← Gemini, salida estructurada y validada
  ↓
Deterministic Safety Gate    ← puede endurecer, nunca ampliar
  ↓
Case classification
  ↓
Hospital + insurer notification (simultánea)
  ↓
Audit timeline (append-only)
```

Y cuando llega algo nuevo:

```
NEW_EVIDENCE → REASSESSING → Analyzer → Safety Gate → DECISION_UPDATED
```

El estado anterior no se borra. Se **superpone**. Un auditor puede abrir el
caso seis meses después y ver, evento por evento, qué se sabía, cuándo, qué
decidió el sistema y por qué cambió.

## Estados del caso

Fuente única de verdad: [`src/core/domain/case-status.ts`](../src/core/domain/case-status.ts).

| Estado | Significado |
|---|---|
| `ADMITTED` | Ingreso recibido del hospital. Aún no se evaluó nada. |
| `CHECKING` | Evaluación inicial en curso. |
| `VERIFIED` | Cobertura verificada. Póliza vigente, hospital en red, documentación completa, sin conflictos. |
| `DOCUMENTS_REQUIRED` | Cobertura potencialmente válida; faltan documentos obligatorios **identificados con precisión**. |
| `HUMAN_REVIEW` | Hay un conflicto o una incertidumbre relevante. Decide una persona. |
| `REASSESSING` | Llegó evidencia nueva; el expediente se está reevaluando. |
| `RESOLVED` | Caso cerrado. Estado terminal. |

Crear un estado nuevo exige una entrada en [`DECISIONS.md`](DECISIONS.md).

## Seguridad y human-in-the-loop

SCAYL Pulse **no toma decisiones médicas**. No diagnostica. No puede impedir
la atención de emergencia. Cada notificación que sale del sistema lleva esa
frase escrita.

El sistema **no inventa**: ni diagnósticos, ni antecedentes, ni cláusulas, ni
pólizas, ni evidencia. Las citas del modelo que apuntan a registros
inexistentes se descartan antes de llegar a la interfaz.

**Las reglas determinísticas prevalecen siempre sobre el LLM.**

La IA se usa para lo que sí hace bien:

- extracción estructurada de documentos;
- análisis y relación de evidencia;
- detección de información faltante;
- resumen y explicación de un resultado que ya decidieron las reglas.

Cuando hay incertidumbre relevante, el caso va a `HUMAN_REVIEW`:

| Situación | Resultado forzado |
|---|---|
| Póliza vencida | nunca `VERIFIED` |
| Documento obligatorio ausente | `DOCUMENTS_REQUIRED` |
| Preexistencia potencial + evidencia insuficiente | `HUMAN_REVIEW` |
| Confianza del modelo por debajo del umbral (0.7) | `HUMAN_REVIEW` |
| Hospital fuera de red o desconocido | `HUMAN_REVIEW` |

## Alcance del MVP

**Dentro:** webhook de ingreso, validación de póliza, historial y
preexistencias, análisis con IA validado, Safety Gate, clasificación,
notificación dual simultánea, timeline auditable, reevaluación por evidencia,
escenarios GREEN/YELLOW/RED reproducibles.

**Fuera (por ahora):** autenticación de usuarios, multi-tenant real, envío de
correo/SMS de verdad, OCR real de documentos, integración HL7/FHIR.
Las ideas van a [`IDEAS.md`](IDEAS.md), no al código.
