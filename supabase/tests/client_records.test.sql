begin;

create extension if not exists pgtap with schema extensions;
set local search_path = gym_api, gym_private, extensions, public;

select plan(14);
select ok((select relrowsecurity from pg_class where oid = 'gym_api.client_details'::regclass), 'RLS en ficha');
select ok((select relrowsecurity from pg_class where oid = 'gym_api.measurements'::regclass), 'RLS en mediciones');
select ok((select relrowsecurity from pg_class where oid = 'gym_api.measurement_revisions'::regclass), 'RLS en revisiones');
select ok((select relrowsecurity from pg_class where oid = 'gym_private.client_invitations'::regclass), 'RLS en invitaciones');
select ok((select relrowsecurity from pg_class where oid = 'gym_private.client_profile_edits'::regclass), 'RLS en auditoría');
select ok(not has_table_privilege('authenticated', 'gym_api.client_details', 'INSERT,UPDATE,DELETE'), 'Ficha requiere escritura auditada');
select ok(not has_table_privilege('authenticated', 'gym_api.measurements', 'INSERT,UPDATE,DELETE'), 'Medición sin escritura directa');
select ok(not has_table_privilege('authenticated', 'gym_api.measurement_revisions', 'INSERT,UPDATE,DELETE'), 'Revisiones inmutables desde la API');
select ok(not has_table_privilege('authenticated', 'gym_private.client_invitations', 'SELECT,UPDATE'), 'Hash y estado de invitación privados');
select ok(not has_function_privilege('authenticated', 'gym_api.issue_client_invitation(uuid,uuid,text,text,uuid)', 'EXECUTE'), 'El coach no puede emitir un token propio');
select ok(has_function_privilege('service_role', 'gym_api.issue_client_invitation(uuid,uuid,text,text,uuid)', 'EXECUTE'), 'Emisión restringida al servidor');
select ok(not has_function_privilege('anon', 'gym_api.set_client_consent(uuid,uuid,text,boolean)', 'EXECUTE'), 'Anónimo no administra consentimientos');
select ok(not has_column_privilege('authenticated', 'gym_api.measurements', 'relationship_id', 'SELECT'), 'Procedencia interna no expuesta');

select ok(not has_function_privilege('authenticated', 'gym_api.can_attempt_client_invitation(uuid,text,text)', 'EXECUTE'), 'El canje previo solo está disponible para el servidor');

select * from finish();
rollback;
