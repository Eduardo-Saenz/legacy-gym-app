# Ciclo de vida de las invitaciones

El registro público se deshabilita en Supabase Auth. El primer coach se incorpora por un procedimiento administrativo restringido e idempotente que vincula la identidad verificada con la organización inicial. Se recomienda exigirle MFA antes del piloto con datos reales.

| Estado | Transición |
| --- | --- |
| Pendiente | Un coach autorizado solicita el envío. La vigencia es de 48 horas desde la emisión. |
| Consumida | El destinatario verifica su identidad y confirma. La vinculación y el consumo se confirman en la misma transacción de aplicación. |
| Vencida | El reloj del servidor alcanza el vencimiento. Un canje se rechaza aunque ningún proceso haya actualizado el estado. |
| Reemplazada | El reenvío crea una nueva emisión e invalida la anterior en una misma transacción. |
| Revocada | Una cancelación autorizada impide el canje. |

1. Verificar que el coach puede iniciar la incorporación. Guardar la emisión y la referencia al destino antes de intentar el envío. Separar el resultado de entrega del estado de canje.
2. Para cuentas nuevas, usar Supabase Auth como verificador de identidad. El enlace conduce a una pantalla de confirmación. Una visita automática mediante GET no consume la invitación. Mantener las redirecciones en una lista permitida.
3. En la confirmación, comprobar identidad y correo verificado, emisión vigente y coach habilitado. En una transacción, reclamar la emisión una sola vez y completar la vinculación permitida. Si falla la vinculación, la emisión no queda consumida. Serializar canje, reenvío y revocación para la misma incorporación. Un reenvío posterior a un canje confirmado no reabre el alta.
4. Vincular el enlace a una emisión específica y validar esa misma emisión en cada canje. Evitar buscar la invitación más reciente solo por correo, ya que eso permitiría que un enlace sustituido aceptara la nueva emisión. Esto aplica incluso si un enlace anterior todavía permite verificar identidad en Supabase Auth. Una identidad autenticada sin incorporación válida no obtiene acceso a una ficha ni a una relación.
5. Registrar eventos sin guardar tokens en claro ni incluirlos en logs. Si se necesita una credencial propia de canje, almacenar su hash. Limitar la frecuencia de envíos y proteger la pantalla de activación de caché y referidores que puedan divulgar el enlace.

Un fallo de correo es recuperable mediante un reintento controlado. La emisión sustituida nunca vuelve a activarse. Dos canjes simultáneos solo pueden generar una incorporación. La vinculación usa la identidad verificada de Supabase Auth como identificador estable. El correo verificado sirve para comprobar el destinatario durante el canje.

Antes de implementar, validar en Supabase local la plantilla y el mecanismo exacto de verificación. El GET debe evitar también consumir la credencial de Auth. Verificar cómo se reenvía a una identidad pendiente o ya confirmada por un enlace anterior sin habilitar el registro público. La caducidad de la emisión y la de la credencial de Auth son independientes. Probar el canje cerca de las 48 horas y el rechazo a partir del vencimiento.

## Correo asociado a una cuenta existente

El flujo futuro pedirá iniciar sesión con esa cuenta y verificar que el correo coincide con el destinatario. Reutilizará el cliente global y conservará el historial. Si ya hay un coach activo, requerirá una transferencia explícita y autorización del cliente. Para el MVP se puede diferir ese flujo. En ese caso, la operación devuelve un estado controlado, sin crear cuentas duplicadas, modificar relaciones ni revelar si un correo existe a actores sin permiso.
