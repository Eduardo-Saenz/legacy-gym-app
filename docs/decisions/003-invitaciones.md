# ADR 003 — Incorporación por invitación

**Estado:** Aceptado

## Contexto

El MVP requiere altas iniciadas por un coach y creación restringida del primer coach.

## Decisión

Deshabilitar el registro público. Supabase Auth verifica la identidad y la aplicación controla el canje. Cada emisión caduca a las 48 horas, admite un consumo y queda invalidada al reenviar. Aprovisionar el primer coach mediante un procedimiento administrativo reproducible.

## Consecuencias

La activación depende del estado en la aplicación incluso cuando Auth verifica la identidad. El envío de correo requiere un manejo explícito de fallos y reintentos. El flujo para cuentas existentes se diseña desde ahora y su implementación puede diferirse.

Ver [ciclo de vida](../invitations.md).
