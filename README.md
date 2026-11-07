# Legacy Gym App

Plataforma web para coaches deportivos y sus clientes. El coach gestiona clientes, crea y asigna rutinas y consulta el progreso autorizado. El cliente activa su cuenta por invitación, consulta sus rutinas y registra entrenamientos y mediciones.

**Estado: Fase 0 documentada.** El repositorio contiene el diseño funcional y técnico. La aplicación, el entorno local y la base de datos se prepararán a partir de la Fase 1.

La arquitectura aprobada es un monolito modular con Next.js App Router, TypeScript estricto, pnpm y Supabase (Auth y PostgreSQL con RLS). La web y la futura app iOS compartirán servicios de aplicación a través de adaptadores web y contratos HTTP versionados. El piloto comenzará con un coach y una organización.

- [Índice de documentación](docs/README.md)
- [Plan por fases y criterios de aceptación](docs/plan.md)
- [Instrucciones para agentes](AGENTS.md)
