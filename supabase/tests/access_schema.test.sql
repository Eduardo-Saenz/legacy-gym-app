begin;

create extension if not exists pgtap with schema extensions;
set local search_path = gym_api, gym_private, extensions, public;

select plan(8);

select is(
  (select count(*)::integer from pg_class as relation
   join pg_namespace as namespace on namespace.oid = relation.relnamespace
   where namespace.nspname in ('gym_api', 'gym_private')
     and relation.relkind = 'r' and relation.relrowsecurity),
  6,
  'Todas las tablas de acceso tienen RLS'
);
select ok(not has_schema_privilege('anon', 'gym_api', 'USAGE'), 'Anónimo sin acceso al esquema API');
select ok(not has_schema_privilege('authenticated', 'gym_private', 'USAGE'), 'El esquema de permisos es privado');
select ok(has_column_privilege('authenticated', 'gym_api.clients', 'id', 'SELECT'), 'Lectura explícita de ID');
select ok(not has_table_privilege('authenticated', 'gym_api.clients', 'INSERT,UPDATE,DELETE'), 'Sin escritura de clientes');
select ok(not has_table_privilege('authenticated', 'gym_api.coach_memberships', 'INSERT,UPDATE,DELETE'), 'Sin escritura de membresías');
select ok(not has_table_privilege('authenticated', 'gym_private.client_authorizations', 'SELECT,INSERT,UPDATE,DELETE'), 'Sin grants directos de autorizaciones');
select ok(not has_function_privilege('anon', 'gym_private.can_read_client(uuid)', 'EXECUTE'), 'Anónimo sin ejecución del predicado');

select * from finish();
rollback;
