# Legacy Gym App

## Antes de cambiar el repositorio

- Lee README.md, docs/README.md y los documentos relacionados con la tarea.
- Revisa el estado de Git. Conserva los cambios ajenos y trabaja en una rama corta con prefijo codex/. Evita cambios directos en main.
- Respeta el alcance de la fase autorizada. Justifica las dependencias nuevas y evita capas o paquetes sin un consumidor concreto.

## Arquitectura

- Coloca cada caso de uso en su módulo. Mantén páginas, Server Actions y Route Handlers como adaptadores.
- Separa identidad verificada, autorización y lógica de negocio. Mantén el código exclusivo del servidor fuera del bundle del navegador.
- Usa DTO explícitos en los contratos HTTP. Actualiza contrato y pruebas si cambia una API pública.

## Seguridad y datos

- Verifica la identidad en el servidor. Autoriza cada operación según titularidad, relación activa, autorización del cliente y campos permitidos.
- Deriva la autoría de la sesión. Trata IDs, organización y roles recibidos como entradas sin verificar.
- Aplica mínimo privilegio con grants, RLS y restricciones de PostgreSQL. Prueba también el acceso directo con credenciales de usuario.
- Usa la identidad del usuario para las operaciones ordinarias. Aísla el acceso administrativo en el servidor.
- Mantén el historial bajo la titularidad del cliente, las mediciones con sus revisiones y las rutinas publicadas con sus versiones.
- Usa solo datos ficticios en desarrollo, pruebas, documentación y previews. Excluye datos personales, secretos y tokens de logs y artefactos.
- No ejecutes operaciones destructivas, cambios en producción ni ediciones de migraciones ya aplicadas sin autorización explícita. Para evolucionar el esquema usa nuevas migraciones.

## Validación y entrega

- Ejecuta las comprobaciones del README cuando existan y reporta las que no pudiste ejecutar.
- Añade pruebas negativas cuando cambien los permisos o la exposición de datos.
- Revisa el diff y resume cambios, validación y decisiones pendientes. Haz push, abre PR o despliega solo si la tarea lo autoriza.
