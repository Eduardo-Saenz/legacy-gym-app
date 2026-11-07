# Modelo conceptual de datos

Este modelo describe responsabilidades e invariantes. Los nombres son orientativos para la Fase 1.

| Entidad | Responsabilidad |
| --- | --- |
| Identidad y perfil | Supabase Auth verifica identidad. El perfil de aplicación referencia esa identidad. |
| Organización y membresía | Identifican dónde actúa un coach y su estado. La organización inicial se aprovisiona administrativamente. |
| Cliente | Identidad funcional estable en toda la plataforma. El alta vincula la cuenta verificada a un único cliente. Una incorporación pendiente no crea otro cliente para una cuenta existente. |
| Relación coach–cliente | Vincula el cliente global con una membresía de coach y conserva inicio y fin. |
| Autorización del cliente | Alcances, vigencia y revocación ligados a una relación. El permiso de un coach no se transfiere a otro. |
| Invitación | Incorporación pendiente, correo destinatario, coach, organización, vencimiento y estado. |
| Tipo de medición | Unidad canónica y reglas de validación. El MVP comienza con peso y estatura. |
| Medición y revisión | Fecha de medición, fecha de registro, valor, unidad y actor. Las revisiones conservan motivo y versión de referencia. |
| Ejercicio, rutina y versión | Catálogo con ámbito de organización. La versión publicada fija el contenido que necesita el historial. |
| Asignación de rutina | Vincula al cliente con una versión publicada y conserva la relación de origen. |
| Sesión, ejercicio realizado y serie | Historial deportivo del cliente. Registra quién capturó la sesión y qué se realizó. |
| Evento de auditoría | Registra acciones de seguridad relevantes y referencias, sin duplicar valores personales. |

## Invariantes

- Un índice único parcial sobre el identificador **global** del cliente limita a una las relaciones activas. La transferencia cierra la anterior y abre la nueva en una transacción. Vincular una cuenta existente nunca desplaza por sí solo al coach activo.
- Las membresías, el catálogo y la publicación de rutinas tienen ámbito de organización. Las restricciones de referencia preservan ese ámbito para datos organizacionales. El historial del cliente se consulta por titularidad o por relación más autorización, y conserva organización y autoría de origen cuando correspondan.
- Una sesión histórica conserva lo necesario para interpretarla sin acceso al catálogo de la organización anterior. La autorización para consultar el historial no concede acceso al catálogo de origen. Restringir borrados en cascada desde organizaciones, relaciones, cuentas y catálogos hacia el historial. Los snapshots históricos contienen solo el contenido prescrito necesario y tienen el mismo control de acceso que su registro padre. La vigencia de una asignación anterior para iniciar sesiones nuevas queda pendiente de decisión funcional.
- Las correcciones añaden revisiones. La revisión y el cambio de versión vigente se confirman juntos. Una corrección basada en una versión desactualizada devuelve un conflicto. Cada revisión y puntero vigente debe pertenecer a la misma medición y titular. Proteger el original y las revisiones contra mutaciones ordinarias. Tratar el motivo como dato sensible, limitar su longitud y mantenerlo fuera de logs.
- La autoría se obtiene del actor autenticado. El cliente conserva su identidad funcional y su historial al cambiar de coach.
