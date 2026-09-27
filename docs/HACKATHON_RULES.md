# Reglas del hackathon — hackIAthon Panamá

Registro literal de lo que la organización exige, para que ningún agente ni
ningún miembro del equipo tenga que reconstruirlo de memoria.

---

## Reto seleccionado

**Sistema de Alerta Temprana de Ingresos a Emergencias.**

Fase actual: **reto inicial clasificatorio**.

## Objetivo oficial del reto

Cuando un asegurado ingresa a la emergencia de un hospital debe activarse un
**webhook**. Un agente debe revisar de inmediato:

- la **validez de la póliza**;
- el **historial / preexistencias**.

Y debe notificar **simultáneamente**:

- al **departamento de admisiones del hospital**;
- al **gestor de casos de la aseguradora**.

## Entregables exigidos

| # | Entregable | Estado |
|---|---|---|
| 1 | Repositorio GitHub con documentación clara | ✅ [`github.com/Silentarcherjr/scayl-pulse`](https://github.com/Silentarcherjr/scayl-pulse), **público desde el 2026-09-26** (ver DEC-010) |
| 2 | Enlace del agente desarrollado y en ejecución | ✅ [`scayl-pulse.vercel.app`](https://scayl-pulse.vercel.app), con Supabase y Gemini |
| 3 | PDF detallando las herramientas de IA utilizadas | ✅ [PDF final de cuatro páginas](../output/pdf/SCAYL_Pulse_Herramientas_IA.pdf), generado y revisado visualmente |

**No hay video obligatorio en esta fase.**

### Qué debe contener el PDF de herramientas de IA

Para **cada herramienta**:

- **Propósito** — por qué se eligió.
- **Aplicación** — dónde y cómo se usó concretamente.
- **Resultados obtenidos** — qué produjo, y qué validación humana recibió.

`docs/AI_USAGE_LOG.md` conserva la fuente viva y trazable usada para generar
el entregable final. **Se llenó durante el desarrollo, no el último día.**

---

## Fecha de entrega confirmada

Las bases recibidas se contradicen sobre la fecha de entrega del reto inicial:

- una sección indica **27 de septiembre, 23:59**;
- el cronograma indica **23 de septiembre**.

**Confirmación de la organización (2026-09-24):** Anthony consultó la
inconsistencia y la organización confirmó que el último día para entregar es
el **27 de septiembre de 2026**.

> Deadline operativo confirmado: **domingo 27 de septiembre de 2026, 23:59
> (hora de Panamá)**. Conservamos la inconsistencia original en este registro
> para que quede trazabilidad de por qué antes se trabajó contra el día 23.

---

## Restricciones que nos imponemos nosotros

Derivadas del dominio, no de las bases, pero igual de obligatorias:

1. **Datos exclusivamente sintéticos.** Nunca información médica real (DEC-002).
2. **Ningún secreto en Git.** `.env*` está ignorado; `.env.example` documenta
   qué claves existen sin revelar ninguna.
3. **El sistema no diagnostica.** No emite juicio clínico ni puede impedir la
   atención de emergencia. Toda notificación lleva esa advertencia explícita.
4. **Las reglas determinísticas prevalecen sobre el LLM**, siempre (DEC-007).
5. **Nunca falsificar una llamada a Gemini.** El fallback determinístico se
   identifica como tal en la base de datos, en el timeline y en la UI (DEC-005).

---

## Criterio de priorización

Construimos **para clasificar**. En este orden:

1. que funcione;
2. que sea fácil de entender;
3. que sorprenda;
4. que sea demostrable;
5. que sea seguro;
6. que esté bien documentado;
7. extras.

Una idea nueva no se implementa: se registra en [`IDEAS.md`](IDEAS.md).
