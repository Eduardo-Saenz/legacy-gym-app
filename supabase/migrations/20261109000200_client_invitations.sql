begin;

create table gym_private.client_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_membership_id uuid not null references gym_api.coach_memberships(id),
  email text not null check (char_length(email) <= 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  expires_at timestamptz not null check (expires_at = created_at + interval '48 hours'),
  state text not null default 'pending' check (state in ('pending', 'consumed', 'revoked', 'superseded')),
  delivery text not null default 'pending' check (delivery in ('pending', 'sent', 'failed')),
  predecessor_id uuid unique references gym_private.client_invitations(id),
  consumed_by uuid references gym_api.profiles(id),
  changed_at timestamptz,
  check ((state = 'pending') = (changed_at is null)),
  check ((state = 'consumed') = (consumed_by is not null))
);
create unique index one_pending_invitation_per_recipient
  on gym_private.client_invitations (coach_membership_id, email) where state = 'pending';
create index invitations_by_membership on gym_private.client_invitations (coach_membership_id, created_at desc);
alter table gym_private.client_invitations enable row level security;
revoke all on gym_private.client_invitations from public, anon, authenticated, service_role;

create function gym_api.coach_invitations()
returns table (id uuid, email text, state text, delivery text, expires_at timestamptz, organization_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.email,
    case when i.state = 'pending' and i.expires_at <= statement_timestamp() then 'expired' else i.state end,
    i.delivery, i.expires_at, o.name
  from gym_private.client_invitations as i
  join gym_api.coach_memberships as m on m.id = i.coach_membership_id
  join gym_api.organizations as o on o.id = m.organization_id
  where m.coach_id = (select auth.uid()) and m.ended_at is null
  order by i.created_at desc, i.id
  limit 100
$$;

-- Only the verified server supplies the coach identity and the hash of the
-- random secret. An authenticated coach cannot set or read that secret via RPC.
create function gym_api.issue_client_invitation(actor uuid, membership uuid, recipient text,
  secret_hash text, predecessor uuid)
returns table (invitation_id uuid, email_address text)
language plpgsql security definer set search_path = '' as $$
declare
  issued_at timestamptz;
  recipient_address text;
  membership_id uuid;
begin
  if predecessor is not null then
    select i.coach_membership_id into membership_id from gym_private.client_invitations as i
      where i.id = predecessor;
  else
    membership_id := membership;
  end if;
  perform 1 from gym_api.coach_memberships as m
    where m.id = membership_id and m.coach_id = actor and m.ended_at is null for update;
  if not found then raise exception 'Invitación no disponible' using errcode = '42501'; end if;
  issued_at := clock_timestamp();

  if (select count(*) from gym_private.client_invitations as i
    where i.coach_membership_id = membership_id and i.created_at > issued_at - interval '1 hour') >= 20 then
    raise exception 'Límite de envíos' using errcode = 'PT429';
  end if;

  if predecessor is not null then
    update gym_private.client_invitations as i set state = 'superseded', changed_at = issued_at
      where i.id = predecessor and i.coach_membership_id = membership_id and i.state = 'pending'
      returning i.email into recipient_address;
    if not found then raise exception 'Invitación no disponible' using errcode = 'PT409'; end if;
  else
    recipient_address := lower(btrim(recipient));
  end if;

  return query insert into gym_private.client_invitations as i
    (coach_membership_id, email, token_hash, created_at, expires_at, predecessor_id)
    values (membership_id, recipient_address, secret_hash, issued_at, issued_at + interval '48 hours', predecessor)
    returning i.id, i.email;
end
$$;

create function gym_api.set_invitation_delivery(invitation uuid, delivered boolean)
returns void language sql security definer set search_path = '' as $$
  update gym_private.client_invitations
    set delivery = case when delivered then 'sent' else 'failed' end
    where id = invitation and delivery = 'pending'
$$;

create function gym_api.revoke_client_invitation(invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from gym_private.client_invitations as i
    join gym_api.coach_memberships as m on m.id = i.coach_membership_id
    where i.id = invitation and m.coach_id = auth.uid() and m.ended_at is null
    for share of m;
  if not found then raise exception 'Invitación no disponible' using errcode = '42501'; end if;
  update gym_private.client_invitations set state = 'revoked', changed_at = clock_timestamp()
    where id = invitation and state = 'pending';
  if not found then raise exception 'Invitación no disponible' using errcode = 'PT409'; end if;
end
$$;

-- The Admin Auth request creates the password account. The trigger commits
-- its application profile, relationship and consumption in that same Auth
-- transaction. A pre-existing account does not run this INSERT trigger.
create function gym_private.activate_invited_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  proof jsonb := new.raw_app_meta_data -> '_gym_invitation';
  invitation uuid;
  membership_id uuid;
  target_client uuid;
  activated_at timestamptz;
begin
  if proof is null then return new; end if;
  invitation := (proof ->> 'id')::uuid;
  select i.coach_membership_id into membership_id from gym_private.client_invitations as i where i.id = invitation;
  perform 1 from gym_api.coach_memberships as m where m.id = membership_id and m.ended_at is null for share;
  if not found then raise exception 'Invitación no disponible' using errcode = '42501'; end if;
  perform 1 from gym_private.client_invitations as i
    where i.id = invitation and i.coach_membership_id = membership_id and i.state = 'pending'
      and i.email = lower(new.email) and i.token_hash = proof ->> 'hash'
      and i.expires_at > clock_timestamp()
    for update;
  if not found or new.email_confirmed_at is null then
    raise exception 'Invitación no disponible' using errcode = '42501';
  end if;

  activated_at := clock_timestamp();
  -- Recheck time after waiting on the invitation lock.
  if not exists (select 1 from gym_private.client_invitations where id = invitation and expires_at > activated_at) then
    raise exception 'Invitación no disponible' using errcode = '42501';
  end if;
  insert into gym_api.profiles (id) values (new.id);
  insert into gym_api.clients (profile_id) values (new.id) returning id into target_client;
  insert into gym_private.coach_client_relationships (client_id, coach_membership_id, started_at)
    values (target_client, membership_id, activated_at);
  update gym_private.client_invitations set state = 'consumed', consumed_by = new.id, changed_at = activated_at
    where id = invitation;
  update auth.users set raw_app_meta_data = raw_app_meta_data - '_gym_invitation' where id = new.id;
  return new;
end
$$;

create trigger gym_activate_invited_user after insert on auth.users
  for each row execute function gym_private.activate_invited_user();

revoke execute on function gym_api.coach_invitations(), gym_api.issue_client_invitation(uuid,uuid,text,text,uuid),
  gym_api.set_invitation_delivery(uuid,boolean), gym_api.revoke_client_invitation(uuid),
  gym_private.activate_invited_user() from public, anon, authenticated, service_role;
grant execute on function gym_api.coach_invitations(), gym_api.revoke_client_invitation(uuid) to authenticated;
grant usage on schema gym_api to service_role;
grant execute on function gym_api.issue_client_invitation(uuid,uuid,text,text,uuid),
  gym_api.set_invitation_delivery(uuid,boolean) to service_role;

commit;
