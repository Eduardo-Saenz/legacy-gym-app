# ADR 002 — Titularidad y autorización

**Estado:** Aceptado

## Contexto

Una persona puede cambiar de coach y de organización sin perder su historial.

## Decisión

Usar un cliente global, como máximo un coach activo por cliente y autorización vigente ligada a la relación. Mantener las organizaciones como ámbito de membresías y recursos del coach. Aplicar autorización de servidor, RLS y grants mínimos. La restricción de unicidad global reside en PostgreSQL.

## Consecuencias

La pertenencia a una organización es insuficiente para acceder a datos del cliente. El historial viaja con su titular y se conserva su procedencia. Una transferencia retira el acceso anterior y el nuevo acceso requiere autorización. La alternativa de encerrar todo el historial bajo la organización de origen complicaría su continuidad y su control por el cliente.

## Controles para la implementación

- Resolver la identidad desde el JWT verificado y los permisos desde registros vigentes. Evitar metadatos editables o claims de relación como fuente de autorización.
- Inventariar tablas, vistas y funciones accesibles. Denegar por defecto, habilitar RLS explícitamente en las tablas expuestas y limitar grants de lectura, escritura y ejecución. RLS filtra filas. Los permisos por campo requieren proyecciones, grants de columna u operaciones acotadas.
- Comprobar condiciones sobre la fila anterior y la resultante en actualizaciones. Impedir cambios de titularidad, relaciones y autoría mediante escritura directa. Usar vistas con permisos del invocador cuando corresponda y funciones con privilegios del invocador por defecto. Revisar por separado cualquier función elevada, con permisos de ejecución explícitos y un search_path controlado.
- Mantener las claves administrativas fuera del camino habitual. Evitar cachear respuestas privadas en caches compartidas. Probar RLS y grants con tokens de usuarios reales del entorno local, además de pruebas a través de Next.js.

Ver [seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api), [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [permisos](../permissions.md) y [modelo conceptual](../data-model.md).
