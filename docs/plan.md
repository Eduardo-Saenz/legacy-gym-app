# Plan de implementación

| Fase | Entregables | Criterios de aceptación |
| --- | --- | --- |
| **0. Documentación** | Instrucciones para agentes, ADR, modelo funcional, matriz, modelo conceptual, invitaciones y plan. | Las decisiones confirmadas tienen una referencia, los supuestos y pendientes están identificados y los enlaces internos resuelven. |
| **1. Base reproducible y aislamiento** | Workspace, Next.js, Supabase local, CI y base del modelo de identidad y acceso. | Un clon limpio arranca siguiendo el README. Datos ficticios de dos organizaciones prueban aislamiento, ausencia de escalada y unicidad global del coach activo bajo concurrencia. |
| **2. Acceso, clientes y mediciones** | Primer coach, invitaciones, ficha, gestión de relación e historial de mediciones. | Activación válida dentro de 48 horas. Las pruebas cubren vencimiento, revocación, canje concurrente, visitas automáticas y rechazo del enlace anterior tras un reenvío. Una transferencia conserva historial, retira acceso anterior y requiere autorización para el nuevo acceso. Corregir conserva original, autor, fecha y motivo. |
| **3. Rutinas y entrenamientos** | Catálogo, borradores, publicación, asignación y registro de sesiones. | Coach y cliente registran según permisos. Reintentar una solicitud no duplica una sesión. Publicar una versión nueva conserva la prescripción y las sesiones anteriores. |
| **4. Progreso básico y piloto** | Dashboards, progreso básico y procedimientos de operación. | Ambos perfiles consultan solo lo autorizado. Se prueban recuperación de cuenta y restauración aislada. Se revisan permisos y tratamiento de datos antes de usar información real. |
| **Posterior al MVP** | iOS, administración de múltiples organizaciones y estadísticas avanzadas. | iOS usa los contratos HTTP y las mismas reglas de acceso. Administrar varias organizaciones conserva el aislamiento y la unicidad global del coach activo. |

## Organización prevista para la Fase 1

- `apps/web/src/app` para rutas y adaptadores, con `api/v1` para el contrato HTTP.
- `apps/web/src/modules` para acceso, clientes, planificación, entrenamientos y progreso.
- `apps/web/src/server` para integración con Supabase y credenciales de servidor.
- `supabase/` para configuración local, migraciones, seeds ficticios y pruebas SQL.
- `tests/e2e/` y `.github/workflows/` para pruebas de navegador y CI.

## Calidad y operación

Fijar versiones de Node.js, pnpm y Supabase CLI. Usar ESLint con la configuración de Next.js, Prettier, TypeScript estricto, Vitest, pgTAP y Playwright. CI instalará con lockfile congelado y validará formato, lint, tipos, build, reconstrucción de base local, políticas y flujos críticos. Mantener los entornos y secretos de producción separados de PR y previews. Proteger main y revisar especialmente cambios de acceso, invitaciones y esquema.

## Validación de seguridad

En la Fase 1, definir qué objetos quedan expuestos y verificar que el actor de pruebas llega a PostgreSQL con el mismo rol que tendrá en producción. Probar dos clientes, dos coaches de la misma organización y coaches de organizaciones distintas. Cubrir JWT emitidos antes de la revocación, identificadores manipulados, intentos de autoasignación y consultas directas por la Data API. Añadir pruebas de joins, agregados, revisiones y escrituras concurrentes al implementar esos flujos.

Antes de usar datos reales, inventariar finalidad, acceso y retención de cada campo. Tratar peso, estatura, fecha de nacimiento y motivos de corrección como información personal de acceso restringido. Excluir valores y cuerpos de solicitudes de logs, trazas y analítica. Revisar copias, exportaciones y restauración. Una restauración debe comprobar que no vuelve a conceder permisos revocados después de la copia antes de reabrir el servicio.

## Decisiones por momento

- **Fase 1:** cerrar la superficie técnica de acceso y los invariantes de cliente global, relación única y autorización ligada a la relación. Los invariantes funcionales ya están aprobados. Mantener denegados los recursos y permisos aún no definidos. El workspace, CI y el esquema de acceso con datos ficticios pueden avanzar.

- **Fase 2.** La ficha y el historial siguen el [ADR 005](decisions/005-alcances-de-ficha-y-mediciones.md). El acceso es por correo y contraseña, el canje se confirma en Auth y la vinculación de cuentas existentes se difiere.
- **Fases siguientes.** Definir quién inicia y confirma una transferencia desde la aplicación, la edición de entrenamientos y si una rutina previa permite iniciar sesiones después de un cambio de coach.
- **Antes del piloto:** reglas para menores, región, retención, conservación legal y objetivos de recuperación. Mantener cualquier acceso excepcional deshabilitado hasta definirlo.
