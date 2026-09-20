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
| 1 | Repositorio GitHub con documentación clara | 🟡 Repo creado y documentado; **falta hacerlo público** (ver DEC-010) |
| 2 | Enlace del agente desarrollado y en ejecución | 🔴 Pendiente de despliegue en Vercel |
| 3 | PDF detallando las herramientas de IA utilizadas | 🟡 Fuente viva en [`AI_USAGE_LOG.md`](AI_USAGE_LOG.md); falta exportar a PDF |

**No hay video obligatorio en esta fase.**

### Qué debe contener el PDF de herramientas de IA

Para **cada herramienta**:

- **Propósito** — por qué se eligió.
- **Aplicación** — dónde y cómo se usó concretamente.
- **Resultados obtenidos** — qué produjo, y qué validación humana recibió.

`docs/AI_USAGE_LOG.md` está estructurado exactamente con esas columnas para
que exportarlo sea mecánico. **Se llena durante el desarrollo, no el último
día.**

---

## ⚠️ Inconsistencia documental detectada en las bases

Las bases recibidas se contradicen sobre la fecha de entrega del reto inicial:

- una sección indica **27 de septiembre, 23:59**;
- el cronograma indica **23 de septiembre**.

**Decisión operativa del equipo:** trabajamos contra el **23 de septiembre**
como deadline real hasta que la organización confirme lo contrario. Si la
fecha buena resulta ser el 27, ganamos cuatro días. Si es el 23 y hubiéramos
asumido el 27, quedamos fuera.

**Acción pendiente (humana):** pedir confirmación escrita a la organización y
actualizar esta sección con la respuesta y su fecha.

> Fechas relativas convertidas a absolutas: el deadline operativo es el
> **miércoles 23 de septiembre de 2026, 23:59 (hora de Panamá)**.

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
