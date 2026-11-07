# ADR 004 — Historial y versiones

**Estado:** Aceptado

## Contexto

El cliente debe conservar su progreso y el contexto de lo entrenado aunque cambie una medición, rutina o coach.

## Decisión

Conservar mediciones originales y registrar correcciones como revisiones con actor, fecha y motivo. Versionar las rutinas publicadas y guardar la referencia a la versión usada. Conservar bajo titularidad del cliente el contenido histórico necesario para interpretar sus sesiones.

## Consecuencias

Los cálculos de progreso usan la revisión vigente. Las correcciones concurrentes requieren control de versión. Las modificaciones de rutinas se publican como versiones nuevas y el historial previo sigue siendo interpretable después de una transferencia.

Ver [modelo conceptual](../data-model.md).
