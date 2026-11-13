# Implementación de la Fase 2

## Identidad y activación

Next.js usa cookies HTTP-only y verifica la sesión en Supabase Auth antes de cada operación sensible. La aplicación autentica por correo y contraseña. La recuperación usa el token de Auth y exige un envío de formulario antes de verificarlo. Los enlaces llevan el secreto en un fragmento, que el navegador excluye de la petición GET. Las cuentas sin perfil o membresía ven una pantalla de acceso pendiente.

El coach autenticado emite para una membresía vigente propia. El servidor genera un secreto aleatorio de 256 bits y envía el enlace a Mailpit. PostgreSQL almacena el hash y serializa reenvíos, revocaciones y canjes. Las emisiones duran 48 horas y se limita la emisión a 20 por hora y por membresía. La entrega se registra por separado. Cuando falla, el coach puede reenviar y sustituir la emisión previa.

El envío del formulario verifica la emisión y solicita el alta a Auth. Un disparador diferido vuelve a comprobar destinatario, hash, expiración, estado y membresía al confirmar la transacción de Auth. La cuenta, el perfil, el cliente global, la relación y el consumo se confirman juntos. El disparador elimina el metadato transitorio. Abrir el enlace por GET no inicia esa operación. Si ya existe una cuenta, se devuelve el mismo error de activación que para una emisión no disponible. El flujo preserva esa cuenta y su relación, si la tiene. Un alta ya confirmada puede recuperarse iniciando sesión con la contraseña elegida.

## Persistencia y autorización

| Objeto | Control |
| --- | --- |
| `gym_api.client_details` | Nombre y fecha de nacimiento opcional. Lectura por titularidad o permiso de ficha. |
| `gym_private.client_profile_edits` | Auditoría privada de cambios efectivos, con actor y fecha. |
| `gym_api.measurements` | Original inmutable, titular, peso en kg o estatura en cm, fechas de medición y registro, autor. |
| `gym_api.measurement_revisions` | Original y revisiones unidos por clave compuesta de medición, cliente y tipo. Cada revisión conserva versión, valor anterior, valor nuevo, motivo, autor y fecha. |
| `gym_private.client_invitations` | Emisiones con hash, estado, entrega, vencimiento y referencia a la emisión sustituida. |
| `gym_private.client_authorizations` | Alcances vigentes por relación, con momento de concesión, posible caducidad y revocación. |

Las lecturas de ficha, mediciones y revisiones usan RLS. Las mutaciones se concentran en funciones de PostgreSQL con `search_path` vacío y permisos de ejecución explícitos. La ficha, las mediciones y el consentimiento usan la identidad del usuario. Solo la emisión, su entrega, la comprobación previa al canje y el alta de Auth usan acceso administrativo. El aprovisionamiento del coach es un comando administrativo para el entorno local.

La base exige peso de 10 a 500 kg, estatura de 40 a 280 cm, precisión de hasta dos decimales y fechas de medición sin adelantar la fecha de registro en UTC. La ficha y su auditoría se guardan juntas. La corrección compara la versión observada y devuelve un conflicto ante una escritura concurrente. El valor vigente se deriva de la última revisión.

## Transferencia y límites del piloto

La Fase 2 prueba transferencias con una transacción administrativa controlada que cierra la relación anterior y abre la nueva. El cliente conserva su identificador, ficha, mediciones y revisiones. El nuevo coach debe recibir consentimiento explícito y el anterior pierde acceso. La interfaz de transferencia y la vinculación de cuentas existentes quedan pendientes de definir quién inicia y confirma la operación.

La aplicación está configurada para la instancia local y Mailpit. Antes de un piloto con datos reales quedan por resolver el transporte de correo, la configuración de despliegue, la gestión de menores, la retención y la restauración. El contrato JSON de [mediciones](measurements.openapi.yaml) usa credenciales Bearer de Supabase y verifica su identidad en el servidor. Los formularios web reutilizan los mismos casos de uso y controles de PostgreSQL.

## Observaciones de UX para fases posteriores

La validación manual de los portales de coach y cliente confirmó los flujos principales. Se registran estas mejoras sin ampliar el alcance funcional de este PR:

- Mostrar nombres reconocibles de coaches y gimnasios en lugar de UUID.
- Presentar las fechas en un formato adecuado para México.
- Simplificar la presentación de autorizaciones para usuarios no técnicos.
- Mejorar la navegación y la jerarquía visual.
