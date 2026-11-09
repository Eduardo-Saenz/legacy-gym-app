begin;

-- PostgREST uses all three columns of the revision's composite foreign key
-- to fetch a measurement and its audit trail in one consistent read.
grant select (kind) on gym_api.measurement_revisions to authenticated;

-- Avoid invoking the privileged Auth endpoint for a random or stale link.
-- The deferred Auth trigger remains authoritative at commit.
create function gym_api.can_attempt_client_invitation(invitation uuid, secret_hash text, recipient text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from gym_private.client_invitations as i
    join gym_api.coach_memberships as m on m.id = i.coach_membership_id
    where i.id = invitation and i.token_hash = secret_hash and i.email = recipient
      and i.state = 'pending' and i.expires_at > statement_timestamp() and m.ended_at is null
  )
$$;

revoke execute on function gym_api.can_attempt_client_invitation(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function gym_api.can_attempt_client_invitation(uuid,text,text) to service_role;

commit;
