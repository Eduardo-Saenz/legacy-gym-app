begin;

alter table gym_private.client_authorizations drop constraint client_authorizations_scope_check;
alter table gym_private.client_authorizations add constraint client_authorizations_scope_check
  check (scope in ('client_record_read', 'client_profile_write', 'measurement_read',
    'measurement_write', 'measurement_correct'));

create table gym_api.client_details (
  client_id uuid primary key references gym_api.clients(id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  birth_date date check (birth_date >= date '1900-01-01')
);

create table gym_private.client_profile_edits (
  id bigint generated always as identity primary key,
  client_id uuid not null references gym_api.clients(id),
  actor_id uuid not null references gym_api.profiles(id),
  relationship_id uuid references gym_private.coach_client_relationships(id),
  old_name text,
  old_birth_date date,
  new_name text not null,
  new_birth_date date,
  changed_at timestamptz not null default clock_timestamp()
);

create function gym_private.valid_measurement(kind text, amount numeric)
returns boolean language sql immutable set search_path = '' as $$
  select case kind when 'weight' then amount between 10 and 500
                   when 'height' then amount between 40 and 280
                   else false end and amount = round(amount, 2)
$$;

create table gym_api.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references gym_api.clients(id),
  kind text not null,
  unit text not null,
  original_value numeric not null,
  measured_on date not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null references gym_api.profiles(id),
  relationship_id uuid references gym_private.coach_client_relationships(id),
  unique (id, client_id, kind),
  check ((kind = 'weight' and unit = 'kg') or (kind = 'height' and unit = 'cm')),
  check (gym_private.valid_measurement(kind, original_value)),
  check (measured_on between date '1900-01-01' and (recorded_at at time zone 'UTC')::date)
);

create index measurements_by_client on gym_api.measurements (client_id, measured_on desc);

create table gym_api.measurement_revisions (
  measurement_id uuid not null,
  client_id uuid not null,
  kind text not null,
  version integer not null check (version > 0),
  previous_value numeric not null,
  new_value numeric not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  corrected_by uuid not null references gym_api.profiles(id),
  corrected_at timestamptz not null default clock_timestamp(),
  relationship_id uuid references gym_private.coach_client_relationships(id),
  primary key (measurement_id, version),
  foreign key (measurement_id, client_id, kind)
    references gym_api.measurements(id, client_id, kind),
  check (gym_private.valid_measurement(kind, previous_value)),
  check (gym_private.valid_measurement(kind, new_value)),
  check (previous_value <> new_value)
);

create index revisions_by_client on gym_api.measurement_revisions (client_id, measurement_id, version);

create function gym_private.owns_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from gym_api.clients
    where id = target and profile_id = (select auth.uid()))
$$;

create function gym_private.has_client_scope(target uuid, required_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from gym_private.coach_client_relationships as r
    join gym_api.coach_memberships as m on m.id = r.coach_membership_id
    join gym_private.client_authorizations as a on a.relationship_id = r.id
    where r.client_id = target and r.ended_at is null and r.started_at <= statement_timestamp()
      and m.coach_id = (select auth.uid()) and m.ended_at is null
      and a.scope = required_scope and a.revoked_at is null
      and a.valid_from <= statement_timestamp()
      and (a.expires_at is null or a.expires_at > statement_timestamp())
  )
$$;

alter table gym_api.client_details enable row level security;
alter table gym_api.measurements enable row level security;
alter table gym_api.measurement_revisions enable row level security;
alter table gym_private.client_profile_edits enable row level security;
revoke all on gym_api.client_details, gym_api.measurements, gym_api.measurement_revisions,
  gym_private.client_profile_edits from public, anon, authenticated, service_role;

grant select (client_id, full_name, birth_date) on gym_api.client_details to authenticated;
grant select (id, client_id, kind, unit, original_value, measured_on, recorded_at, recorded_by)
  on gym_api.measurements to authenticated;
grant select (measurement_id, client_id, version, previous_value, new_value, reason, corrected_by, corrected_at)
  on gym_api.measurement_revisions to authenticated;

create policy read_client_details on gym_api.client_details for select to authenticated using (
  gym_private.owns_client(client_id) or gym_private.has_client_scope(client_id, 'client_record_read')
);
create policy read_measurements on gym_api.measurements for select to authenticated using (
  gym_private.owns_client(client_id) or gym_private.has_client_scope(client_id, 'measurement_read')
);
create policy read_revisions on gym_api.measurement_revisions for select to authenticated using (
  gym_private.owns_client(client_id) or gym_private.has_client_scope(client_id, 'measurement_read')
);

-- All client writes and consent changes take the same client lock. Coach writes
-- also hold share locks on the relationship and membership until they commit.
create function gym_private.lock_client_write(target uuid, required_scope text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  active_relationship uuid;
begin
  select c.profile_id into owner_id from gym_api.clients as c where c.id = target for update;
  if owner_id = auth.uid() then return null; end if;

  select r.id into active_relationship from gym_private.coach_client_relationships as r
    join gym_api.coach_memberships as m on m.id = r.coach_membership_id
    where r.client_id = target and r.ended_at is null and r.started_at <= clock_timestamp()
      and m.coach_id = auth.uid() and m.ended_at is null
    for share of r, m;
  if active_relationship is null or not exists (
    select 1 from gym_private.client_authorizations as a
      where a.relationship_id = active_relationship and a.scope = required_scope
      and a.revoked_at is null and a.valid_from <= clock_timestamp()
      and (a.expires_at is null or a.expires_at > clock_timestamp())
      for share
  ) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  return active_relationship;
end
$$;

create function gym_api.save_client_details(target uuid, name_value text, date_value date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid;
  previous gym_api.client_details%rowtype;
begin
  rel := gym_private.lock_client_write(target, 'client_profile_write');
  if name_value is null or char_length(btrim(name_value)) not between 1 and 120
    or date_value not between date '1900-01-01' and (clock_timestamp() at time zone 'UTC')::date then
    raise exception 'Ficha no válida' using errcode = '22023';
  end if;
  name_value := btrim(name_value);
  select * into previous from gym_api.client_details where client_id = target;
  if (previous.full_name, previous.birth_date) is not distinct from (name_value, date_value) then return; end if;
  insert into gym_api.client_details (client_id, full_name, birth_date)
    values (target, name_value, date_value)
    on conflict (client_id) do update set full_name = excluded.full_name, birth_date = excluded.birth_date;
  insert into gym_private.client_profile_edits
    (client_id, actor_id, relationship_id, old_name, old_birth_date, new_name, new_birth_date)
    values (target, auth.uid(), rel, previous.full_name, previous.birth_date, name_value, date_value);
end
$$;

create function gym_api.record_measurement(target uuid, kind_value text, unit_value text,
  amount numeric, measured date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid;
  measurement uuid;
begin
  rel := gym_private.lock_client_write(target, 'measurement_write');
  insert into gym_api.measurements (client_id, kind, unit, original_value, measured_on, recorded_by, relationship_id)
    values (target, kind_value, unit_value, amount, measured, auth.uid(), rel)
    returning id into measurement;
  return measurement;
end
$$;

create function gym_api.correct_measurement(target uuid, measurement uuid, expected_version integer,
  amount numeric, explanation text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  rel uuid;
  record gym_api.measurements%rowtype;
  current_version integer;
  current_amount numeric;
begin
  rel := gym_private.lock_client_write(target, 'measurement_correct');
  select * into record from gym_api.measurements as m where m.id = measurement and m.client_id = target;
  if not found then raise exception 'Medición no disponible' using errcode = '42501'; end if;
  -- Corrections include the existing value, so require read access independently.
  if rel is not null and not exists (
    select 1 from gym_private.client_authorizations as a where a.relationship_id = rel
      and a.scope = 'measurement_read' and a.revoked_at is null and a.valid_from <= clock_timestamp()
      and (a.expires_at is null or a.expires_at > clock_timestamp()) for share
  ) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  select r.version, r.new_value into current_version, current_amount
    from gym_api.measurement_revisions as r where r.measurement_id = measurement
    order by r.version desc limit 1;
  current_version := coalesce(current_version, 0);
  current_amount := coalesce(current_amount, record.original_value);
  if expected_version is distinct from current_version then
    raise exception 'La medición cambió' using errcode = 'PT409';
  end if;
  insert into gym_api.measurement_revisions (measurement_id, client_id, kind, version,
    previous_value, new_value, reason, corrected_by, relationship_id)
    values (measurement, target, record.kind, current_version + 1,
      current_amount, amount, btrim(explanation), auth.uid(), rel);
  return current_version + 1;
end
$$;

create function gym_api.active_clients()
returns table (client_id uuid, full_name text, scopes text[])
language sql stable security definer set search_path = '' as $$
  select r.client_id,
    case when 'client_record_read' = any(p.scopes) then d.full_name end, p.scopes
  from gym_private.coach_client_relationships as r
  join gym_api.coach_memberships as m on m.id = r.coach_membership_id
  left join gym_api.client_details as d on d.client_id = r.client_id
  cross join lateral (
    select coalesce(array_agg(distinct a.scope order by a.scope), array[]::text[]) as scopes
    from gym_private.client_authorizations as a
    where a.relationship_id = r.id and a.revoked_at is null
      and a.valid_from <= statement_timestamp() and (a.expires_at is null or a.expires_at > statement_timestamp())
  ) as p
  where m.coach_id = (select auth.uid()) and m.ended_at is null
    and r.ended_at is null and r.started_at <= statement_timestamp()
  order by r.started_at desc, r.id
$$;

create function gym_api.client_consents(target uuid)
returns table (relationship_id uuid, coach_id uuid, organization_name text, scope text,
  granted_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, m.coach_id, o.name, a.scope, a.valid_from, a.expires_at
  from gym_private.coach_client_relationships as r
  join gym_api.coach_memberships as m on m.id = r.coach_membership_id
  join gym_api.organizations as o on o.id = m.organization_id
  left join gym_private.client_authorizations as a on a.relationship_id = r.id
    and a.revoked_at is null and a.valid_from <= statement_timestamp()
    and (a.expires_at is null or a.expires_at > statement_timestamp())
  where r.client_id = target and r.ended_at is null and r.started_at <= statement_timestamp()
    and m.ended_at is null and gym_private.owns_client(target)
$$;

create function gym_api.set_client_consent(target uuid, relationship uuid, scope_value text, allow boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if scope_value is null or allow is null or scope_value not in ('client_record_read', 'client_profile_write',
    'measurement_read', 'measurement_write', 'measurement_correct') then
    raise exception 'Alcance no válido' using errcode = '22023';
  end if;
  perform 1 from gym_api.clients where id = target and profile_id = auth.uid() for update;
  if not found then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  perform 1 from gym_private.coach_client_relationships as r
    join gym_api.coach_memberships as m on m.id = r.coach_membership_id
    where r.id = relationship and r.client_id = target and r.ended_at is null
      and r.started_at <= clock_timestamp() and m.ended_at is null for share of r, m;
  if not found then raise exception 'Relación no disponible' using errcode = '42501'; end if;
  if allow then
    insert into gym_private.client_authorizations (relationship_id, scope, valid_from)
    select relationship, scope_value, clock_timestamp() where not exists (
      select 1 from gym_private.client_authorizations as a
      where a.relationship_id = relationship and a.scope = scope_value and a.revoked_at is null
        and a.valid_from <= clock_timestamp() and (a.expires_at is null or a.expires_at > clock_timestamp())
    );
  else
    update gym_private.client_authorizations as a set revoked_at = greatest(clock_timestamp(), a.valid_from)
    where a.relationship_id = relationship and a.scope = scope_value and a.revoked_at is null;
  end if;
end
$$;

revoke execute on function gym_private.valid_measurement(text,numeric), gym_private.owns_client(uuid),
  gym_private.has_client_scope(uuid,text), gym_private.lock_client_write(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function gym_private.owns_client(uuid), gym_private.has_client_scope(uuid,text)
  to authenticated;
revoke execute on all functions in schema gym_api from public, anon, authenticated, service_role;
grant execute on function gym_api.save_client_details(uuid,text,date),
  gym_api.record_measurement(uuid,text,text,numeric,date),
  gym_api.correct_measurement(uuid,uuid,integer,numeric,text),
  gym_api.active_clients(), gym_api.client_consents(uuid),
  gym_api.set_client_consent(uuid,uuid,text,boolean) to authenticated;

commit;
