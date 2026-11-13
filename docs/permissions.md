# Matriz inicial de permisos

Denegar por defecto. Una cuenta autenticada solo identifica al actor. Los permisos se comprueban en cada operación con datos vigentes.

| Operación | Cliente | Coach | Operador de plataforma |
| --- | --- | --- | --- |
| Leer ficha, sesiones, mediciones y progreso | Solo propios | Relación activa y autorización del cliente para ese alcance | Sin acceso ordinario |
| Editar datos personales | Nombre y fecha de nacimiento propios | Nombre y fecha de nacimiento delegados, con relación activa y autorización | Sin acceso ordinario |
| Registrar mediciones o entrenamientos | Solo propios | Para cliente activo con autorización de escritura aplicable | Sin acceso ordinario |
| Corregir mediciones | Cualquier medición propia | Las de clientes activos con autorización de lectura y corrección | Sin acceso ordinario |
| Ver revisiones de mediciones | Propias, como titular del historial | Con alcance autorizado para ver revisiones | Sin acceso ordinario |
| Crear ejercicios, editar borradores y publicar rutinas | Sin acceso | Dentro de su ámbito de autoría en la organización | Sin acceso ordinario |
| Asignar rutina publicada | Sin acceso | Para cliente activo con autorización aplicable | Sin acceso ordinario |
| Consultar rutina asignada | Asignación propia | Relación activa y alcance autorizado para esa asignación | Sin acceso ordinario |
| Enviar o reenviar invitación | Sin acceso | Para una incorporación a su nombre y en su organización | Solo para aprovisionar el primer coach |
| Otorgar o revocar autorización para acceder a sus datos | Para sus propios datos y según los alcances aprobados | Sin acceso | Sin acceso ordinario |

La autorización se vincula al cliente y a la relación concreta. Finalizar la relación o revocar la autorización retira los permisos correspondientes en la siguiente operación. Aceptar una invitación no autoriza por sí solo el acceso al historial previo. Pertenecer a una organización tampoco concede acceso a los clientes de otros coaches.

La autorización del coach exige una membresía vigente, la relación activa de esa membresía con el titular y un permiso vigente para la acción y el recurso. La autoría, la organización de origen y los identificadores de relaciones antiguas solo describen procedencia. El alcance de lectura de historial y los permisos de escritura o corrección se verifican por separado.

Los permisos aplican también a listados, búsquedas, joins, estadísticas, revisiones y respuestas de error. Derivar el titular y el ámbito de las relaciones persistidas, comprobar cada identificador de la solicitud y rechazar cambios directos a campos de titularidad, procedencia, autoría y autorización. Para escrituras sensibles, serializar la comprobación y la operación respecto a transferencias y revocaciones. Una vez confirmada la revocación, los accesos posteriores deben fallar incluso con un JWT anterior.

La [decisión de la Fase 2](decisions/005-alcances-de-ficha-y-mediciones.md) permite corregir independientemente de la autoría y establece los permisos separados de lectura, registro y corrección. Las reglas de entrenamiento se definirán en su fase.
