begin;

-- Auth fills application metadata and confirms email after the INSERT,
-- within the same transaction. Read the final row at transaction commit.
create or replace function gym_private.activate_invited_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  proof jsonb;
  verified_email text;
  confirmed_at timestamptz;
  invitation uuid;
  membership_id uuid;
  target_client uuid;
  activated_at timestamptz;
begin
  select u.raw_app_meta_data -> '_gym_invitation', u.email, u.email_confirmed_at
    into proof, verified_email, confirmed_at from auth.users as u where u.id = new.id;
  if proof is null then return new; end if;
  invitation := (proof ->> 'id')::uuid;
  select i.coach_membership_id into membership_id from gym_private.client_invitations as i where i.id = invitation;
  perform 1 from gym_api.coach_memberships as m where m.id = membership_id and m.ended_at is null for share;
  if not found then raise exception 'Invitación no disponible' using errcode = '42501'; end if;
  perform 1 from gym_private.client_invitations as i
    where i.id = invitation and i.coach_membership_id = membership_id and i.state = 'pending'
      and i.email = lower(verified_email) and i.token_hash = proof ->> 'hash'
      and i.expires_at > clock_timestamp()
    for update;
  if not found or confirmed_at is null then
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

drop trigger gym_activate_invited_user on auth.users;
create constraint trigger gym_activate_invited_user after insert on auth.users
  deferrable initially deferred for each row execute function gym_private.activate_invited_user();

commit;
