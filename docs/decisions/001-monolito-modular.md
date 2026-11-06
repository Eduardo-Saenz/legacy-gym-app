# ADR 001 — Monolito modular y contratos HTTP

**Estado:** Aceptado

## Contexto

El piloto es web y pequeño. Una futura aplicación iOS necesitará acceso a las mismas operaciones.

## Decisión

Usar un workspace pnpm con Next.js App Router y TypeScript estricto. Separar acceso, clientes, planificación, entrenamientos y progreso dentro de la aplicación. Supabase Auth gestiona la identidad y PostgreSQL la persistencia. Introducir contratos JSON en /api/v1 y documentarlos con OpenAPI conforme se incorporen los casos de uso.

## Consecuencias

Hay un despliegue de aplicación y servicios compartidos entre adaptadores. Los contratos HTTP evolucionan de forma compatible con clientes instalados. Un backend separado se reconsiderará si hay necesidades de operación o escalado independiente. Los paquetes se extraerán cuando tengan consumidores o límites claros.
