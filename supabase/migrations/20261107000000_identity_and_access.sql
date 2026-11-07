begin;

create schema gym_api;
create schema gym_private;

revoke all on schema gym_api, gym_private from public, anon, authenticated, service_role;
grant usage on schema gym_api to authenticated;

-- Avoid inheriting permissive default grants from the platform for future objects.
alter default privileges in schema gym_api, gym_private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema gym_api, gym_private
  revoke execute on functions from anon, authenticated, service_role;

create table gym_api.profiles (
  id uuid primary key references auth.users (id)
);

create table gym_api.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0)
);

create table gym_api.coach_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references gym_api.organizations (id),
  coach_id uuid not null references gym_api.profiles (id),
  ended_at timestamptz,
  unique (coach_id, organization_id)
);

create table gym_api.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references gym_api.profiles (id)
);

create table gym_private.coach_client_relationships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references gym_api.clients (id),
  coach_membership_id uuid not null references gym_api.coach_memberships (id),
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  check (ended_at >= started_at)
);

create unique index one_active_coach_per_client
  on gym_private.coach_client_relationships (client_id)
  where ended_at is null;

create table gym_private.client_authorizations (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references gym_private.coach_client_relationships (id),
  scope text not null check (scope = 'client_record_read'),
  valid_from timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > valid_from),
  check (revoked_at >= valid_from)
);

create index client_authorizations_relationship_id_idx
  on gym_private.client_authorizations (relationship_id);

alter table gym_api.profiles enable row level security;
alter table gym_api.organizations enable row level security;
alter table gym_api.coach_memberships enable row level security;
alter table gym_api.clients enable row level security;
alter table gym_private.coach_client_relationships enable row level security;
alter table gym_private.client_authorizations enable row level security;

revoke all on all tables in schema gym_api, gym_private
  from public, anon, authenticated, service_role;
grant select (id) on gym_api.profiles to authenticated;
grant select (id, name) on gym_api.organizations to authenticated;
grant select (id, organization_id, coach_id, ended_at) on gym_api.coach_memberships to authenticated;
grant select (id, profile_id) on gym_api.clients to authenticated;

-- The policy can read private authorization rows. The caller cannot name this
-- function through the Data API or supply a different coach identity.
create function gym_private.can_read_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from gym_private.coach_client_relationships as relationship
    join gym_api.coach_memberships as membership
      on membership.id = relationship.coach_membership_id
    join gym_private.client_authorizations as permission
      on permission.relationship_id = relationship.id
    where relationship.client_id = target_client_id
      and relationship.ended_at is null
      and relationship.started_at <= statement_timestamp()
      and membership.coach_id = (select auth.uid())
      and membership.ended_at is null
      and permission.scope = 'client_record_read'
      and permission.valid_from <= statement_timestamp()
      and (permission.expires_at is null or permission.expires_at > statement_timestamp())
      and permission.revoked_at is null
  );
$$;

revoke all on function gym_private.can_read_client(uuid)
  from public, anon, authenticated, service_role;
grant execute on function gym_private.can_read_client(uuid) to authenticated;

create policy profiles_read_self on gym_api.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy coach_memberships_read_own_active on gym_api.coach_memberships
  for select to authenticated
  using (coach_id = (select auth.uid()) and ended_at is null);

create policy organizations_read_own on gym_api.organizations
  for select to authenticated using (
    exists (
      select 1 from gym_api.coach_memberships as membership
      where membership.organization_id = organizations.id
        and membership.coach_id = (select auth.uid())
        and membership.ended_at is null
    )
  );

create policy clients_read_owner_or_authorized_coach on gym_api.clients
  for select to authenticated
  using (profile_id = (select auth.uid()) or gym_private.can_read_client(id));

commit;
