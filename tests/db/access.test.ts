import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import postgres from "postgres";
import { afterAll, beforeAll, expect, test } from "vitest";

type LocalStatus = {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

const apiOrigin = "http://127.0.0.1:54321";
const databaseOrigin = "127.0.0.1:54322";
const runId = randomUUID();
const password = "fixture-only-" + randomUUID();
const organizations = [randomUUID(), randomUUID()] as const;
const actors = [
  "coach",
  "colleague",
  "nextCoach",
  "client",
  "otherClient",
  "unprovisioned",
] as const;
type Actor = (typeof actors)[number];
const accounts = new Map<Actor, { id: string; jwt: string }>();
const membership = {
  coach: randomUUID(),
  colleague: randomUUID(),
  nextCoach: randomUUID(),
};
const client = { id: randomUUID(), otherId: randomUUID() };
const relationship = {
  current: randomUUID(),
  other: randomUUID(),
  next: randomUUID(),
};
let status: LocalStatus;
let sql: ReturnType<typeof postgres> | undefined;

function account(actor: Actor) {
  const record = accounts.get(actor);
  if (!record) throw new Error("Falta una cuenta ficticia");
  return record;
}

function auth(path: string, body: object, admin = false) {
  const key = admin ? status.SERVICE_ROLE_KEY : status.ANON_KEY;
  return fetch(apiOrigin + "/auth/v1" + path, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function data(path: string, actor?: Actor, init: RequestInit = {}) {
  return fetch(apiOrigin + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: status.ANON_KEY,
      Authorization: "Bearer " + (actor ? account(actor).jwt : status.ANON_KEY),
      "Accept-Profile": "gym_api",
      "Content-Profile": "gym_api",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function rows(path: string, actor: Actor) {
  const response = await data(path, actor);
  expect(response.status).toBe(200);
  return response.json();
}

async function waitForDataApi() {
  const deadline = Date.now() + 45_000;
  let httpStatus: number;

  do {
    const response = await data("clients?select=id&limit=0", "unprovisioned", {
      signal: AbortSignal.timeout(3_000),
    });
    httpStatus = response.status;
    await response.body?.cancel();
    if (httpStatus === 200) return;
    if (![502, 503, 504].includes(httpStatus)) break;
    await sleep(500);
  } while (Date.now() < deadline);

  throw new Error(`La Data API local no está lista (HTTP ${httpStatus})`);
}

beforeAll(async () => {
  status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as LocalStatus;
  const apiUrl = new URL(status.API_URL);
  const dbUrl = new URL(status.DB_URL);
  if (
    apiUrl.origin !== apiOrigin ||
    dbUrl.protocol !== "postgresql:" ||
    dbUrl.host !== databaseOrigin ||
    dbUrl.pathname !== "/postgres"
  ) {
    throw new Error(
      "Las pruebas requieren las direcciones fijas de Supabase local",
    );
  }
  sql = postgres(status.DB_URL, { connect_timeout: 5, max: 4 });

  for (const actor of actors) {
    const email = actor.toLowerCase() + "-" + runId + "@example.invalid";
    const created = await auth(
      "/admin/users",
      { email, password, email_confirm: true },
      true,
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };
    const record = { id, jwt: "" };
    accounts.set(actor, record);
    const session = await auth("/token?grant_type=password", {
      email,
      password,
    });
    expect(session.status).toBe(200);
    const { access_token } = (await session.json()) as { access_token: string };
    if (!access_token) throw new Error("Auth local no emitió un JWT");
    record.jwt = access_token;
  }

  // A database reset can finish before PostgREST is ready behind the gateway.
  await waitForDataApi();

  await sql.begin(async (tx) => {
    await tx`insert into gym_api.profiles (id)
      values (${account("coach").id}), (${account("colleague").id}), (${account("nextCoach").id}),
      (${account("client").id}), (${account("otherClient").id})`;
    await tx`insert into gym_api.organizations (id, name)
      values (${organizations[0]}, 'Gimnasio ficticio A'), (${organizations[1]}, 'Gimnasio ficticio B')`;
    await tx`insert into gym_api.coach_memberships (id, organization_id, coach_id)
      values (${membership.coach}, ${organizations[0]}, ${account("coach").id}),
        (${membership.colleague}, ${organizations[0]}, ${account("colleague").id}),
        (${membership.nextCoach}, ${organizations[1]}, ${account("nextCoach").id})`;
    await tx`insert into gym_api.clients (id, profile_id)
      values (${client.id}, ${account("client").id}), (${client.otherId}, ${account("otherClient").id})`;
    await tx`insert into gym_private.coach_client_relationships (id, client_id, coach_membership_id)
      values (${relationship.current}, ${client.id}, ${membership.coach}),
        (${relationship.other}, ${client.otherId}, ${membership.nextCoach})`;
    await tx`insert into gym_private.client_authorizations (relationship_id, scope)
      values (${relationship.current}, 'client_record_read'), (${relationship.other}, 'client_record_read')`;
  });
});

afterAll(async () => {
  if (!sql) return;
  try {
    const invited = await sql<{ id: string }[]>`select id from auth.users
      where email like ${"invite-" + runId + "-%@example.invalid"}`;
    await sql.begin(async (tx) => {
      await tx`delete from gym_api.measurement_revisions where client_id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_api.measurements where client_id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_private.client_profile_edits where client_id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_api.client_details where client_id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_private.client_invitations where coach_membership_id = ${membership.coach}`;
      if (invited.length) {
        const ids = invited.map(({ id }) => id);
        await tx`delete from gym_private.coach_client_relationships where client_id in
          (select id from gym_api.clients where profile_id in ${tx(ids)})`;
        await tx`delete from gym_api.clients where profile_id in ${tx(ids)}`;
        await tx`delete from gym_api.profiles where id in ${tx(ids)}`;
      }
      await tx`delete from gym_private.client_authorizations where relationship_id in (
        select id from gym_private.coach_client_relationships where client_id in (${client.id}, ${client.otherId})
      )`;
      await tx`delete from gym_private.coach_client_relationships where client_id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_api.clients where id in (${client.id}, ${client.otherId})`;
      await tx`delete from gym_api.coach_memberships where organization_id in (${organizations[0]}, ${organizations[1]})`;
      await tx`delete from gym_api.organizations where id in (${organizations[0]}, ${organizations[1]})`;
      const ids = Array.from(accounts.values(), ({ id }) => id);
      if (ids.length)
        await tx`delete from gym_api.profiles where id in ${tx(ids)}`;
    });
    for (const { id } of [...accounts.values(), ...invited]) {
      const key = status.SERVICE_ROLE_KEY;
      const response = await fetch(apiOrigin + "/auth/v1/admin/users/" + id, {
        method: "DELETE",
        headers: { apikey: key, Authorization: "Bearer " + key },
      });
      expect(response.ok).toBe(true);
    }
  } finally {
    await sql.end();
  }
});

const target = "clients?select=id&id=eq." + client.id;
const historyPath =
  "measurements?select=id,original_value,recorded_by&id=not.is.null&client_id=eq." +
  client.id;

function rpc(name: string, body: object, actor: Actor | "admin") {
  const key = actor === "admin" ? status.SERVICE_ROLE_KEY : null;
  return data("rpc/" + name, actor === "admin" ? undefined : actor, {
    method: "POST",
    body: JSON.stringify(body),
    headers: key ? { apikey: key, Authorization: "Bearer " + key } : {},
  });
}

function consent(
  scope: string,
  allow = true,
  rel = relationship.current,
  actor: Actor = "client",
) {
  return rpc(
    "set_client_consent",
    { target: client.id, relationship: rel, scope_value: scope, allow },
    actor,
  );
}

test("aísla clientes, organizaciones y perfiles en la Data API", async () => {
  expect(await rows(target, "client")).toEqual([{ id: client.id }]);
  expect(await rows(target, "coach")).toEqual([{ id: client.id }]);

  for (const actor of [
    "colleague",
    "nextCoach",
    "otherClient",
    "unprovisioned",
  ] as const) {
    expect(await rows(target, actor)).toEqual([]);
  }

  expect(await rows("clients?select=id", "otherClient")).toEqual([
    { id: client.otherId },
  ]);
  expect(await rows("clients?select=id", "nextCoach")).toEqual([
    { id: client.otherId },
  ]);
  expect(await rows("organizations?select=id", "coach")).toEqual([
    { id: organizations[0] },
  ]);
  expect(await rows("organizations?select=id", "nextCoach")).toEqual([
    { id: organizations[1] },
  ]);
  expect(await rows("organizations?select=id", "client")).toEqual([]);
  expect(await rows("coach_memberships?select=id", "coach")).toEqual([
    { id: membership.coach },
  ]);
  expect(await rows("profiles?select=id", "coach")).toEqual([
    { id: account("coach").id },
  ]);
  expect(
    await rows("clients?select=id,profiles(id)&id=eq." + client.id, "coach"),
  ).toEqual([{ id: client.id, profiles: null }]);
});

test("rechaza registro público, lectura anónima y escalada directa", async () => {
  const signup = await auth("/signup", {
    email: runId + "@example.invalid",
    password,
  });
  expect(signup.ok).toBe(false);
  expect((await signup.json()).error_code).toBe("signup_disabled");
  expect([401, 403]).toContain((await data(target)).status);
  expect(
    (
      await data(target, "client", {
        method: "PATCH",
        body: JSON.stringify({ profile_id: account("colleague").id }),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await data("coach_memberships", "colleague", {
        method: "POST",
        body: JSON.stringify({
          coach_id: account("colleague").id,
          organization_id: organizations[1],
        }),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await data("client_authorizations?select=id", "colleague", {
        headers: { "Accept-Profile": "gym_private" },
      })
    ).status,
  ).toBe(406);
  expect(
    (
      await data("rpc/can_read_client", "colleague", {
        method: "POST",
        body: JSON.stringify({ target_client_id: client.id }),
      })
    ).status,
  ).toBe(404);
});

test("valida escritura, autoría, titularidad y versiones del historial", async () => {
  const own = {
    target: client.id,
    name_value: "Perfil ficticio",
    date_value: "1995-05-05",
  };
  expect((await rpc("save_client_details", own, "otherClient")).status).toBe(
    403,
  );
  expect((await rpc("save_client_details", own, "coach")).status).toBe(403);
  expect(
    (
      await rpc(
        "save_client_details",
        { ...own, date_value: "2999-01-01" },
        "client",
      )
    ).status,
  ).toBe(400);
  expect((await rpc("save_client_details", own, "client")).ok).toBe(true);
  expect(
    await rows(
      "client_details?select=full_name&client_id=eq." + client.id,
      "colleague",
    ),
  ).toEqual([]);
  expect(
    (await consent("client_profile_write", true, relationship.current, "coach"))
      .status,
  ).toBe(403);
  expect((await consent("client_profile_write")).ok).toBe(true);
  expect(
    (
      await rpc(
        "save_client_details",
        {
          ...own,
          name_value: "Perfil ficticio actualizado",
          date_value: "1994-04-04",
        },
        "coach",
      )
    ).ok,
  ).toBe(true);
  const edits =
    await sql!`select actor_id, old_name, new_name, old_birth_date::text as old_date, new_birth_date::text as new_date
    from gym_private.client_profile_edits
    where client_id = ${client.id} order by id`;
  expect([...edits]).toEqual([
    {
      actor_id: account("client").id,
      old_name: null,
      new_name: "Perfil ficticio",
      old_date: null,
      new_date: "1995-05-05",
    },
    {
      actor_id: account("coach").id,
      old_name: "Perfil ficticio",
      new_name: "Perfil ficticio actualizado",
      old_date: "1995-05-05",
      new_date: "1994-04-04",
    },
  ]);

  const input = {
    target: client.id,
    kind_value: "weight",
    unit_value: "kg",
    amount: 72,
    measured: "2025-01-15",
  };
  expect((await rpc("record_measurement", input, "coach")).status).toBe(403);
  expect((await rpc("record_measurement", input, "otherClient")).status).toBe(
    403,
  );
  for (const invalid of [
    { ...input, unit_value: "cm" },
    { ...input, amount: 501 },
    { ...input, amount: 72.123 },
    { ...input, measured: "2999-01-01" },
  ]) {
    expect((await rpc("record_measurement", invalid, "client")).status).toBe(
      400,
    );
  }
  expect(
    (
      await rpc(
        "record_measurement",
        { ...input, recorded_by: account("coach").id },
        "client",
      )
    ).status,
  ).toBe(404);
  const original = await rpc("record_measurement", input, "client");
  expect(original.ok).toBe(true);
  const originalId = (await original.json()) as string;
  expect(await rows(historyPath, "coach")).toEqual([]);
  const repeatGrants = await Promise.all([
    consent("measurement_read"),
    consent("measurement_read"),
  ]);
  expect(repeatGrants.every((response) => response.ok)).toBe(true);
  const [grantCount] =
    await sql!`select count(*)::int as total from gym_private.client_authorizations
    where relationship_id = ${relationship.current} and scope = 'measurement_read' and revoked_at is null`;
  expect(grantCount.total).toBe(1);
  for (const scope of ["measurement_write", "measurement_correct"]) {
    expect((await consent(scope)).ok).toBe(true);
  }
  expect(
    (await rpc("record_measurement", { ...input, amount: 80 }, "coach")).ok,
  ).toBe(true);
  const recorded = await rows(historyPath, "client");
  expect(recorded).toHaveLength(2);
  expect(recorded).toContainEqual({
    id: originalId,
    original_value: 72,
    recorded_by: account("client").id,
  });
  const coachMeasurement = recorded.find(
    (row: { recorded_by: string }) => row.recorded_by === account("coach").id,
  );
  expect(coachMeasurement).toBeDefined();
  const correction = {
    target: client.id,
    measurement: originalId,
    expected_version: 0,
    amount: 73,
    explanation: "Ajuste ficticio",
  };
  expect(
    (
      await rpc(
        "correct_measurement",
        { ...correction, target: client.otherId },
        "otherClient",
      )
    ).status,
  ).toBe(403);
  expect(
    (await rpc("correct_measurement", correction, "colleague")).status,
  ).toBe(403);
  const concurrent = await Promise.all([
    rpc("correct_measurement", correction, "coach"),
    rpc("correct_measurement", { ...correction, amount: 74 }, "coach"),
  ]);
  expect(concurrent.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    (
      await rpc(
        "correct_measurement",
        { ...correction, expected_version: 1, amount: 75 },
        "client",
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await rpc(
        "correct_measurement",
        { ...correction, measurement: coachMeasurement.id, amount: 81 },
        "client",
      )
    ).ok,
  ).toBe(true);

  const revisions =
    "measurement_revisions?select=version,previous_value,new_value,corrected_by&order=version&measurement_id=eq." +
    originalId;
  const embedded = await rows(
    "measurements?select=id,measurement_revisions(version)&measurement_revisions.order=version.asc&id=eq." +
      originalId,
    "coach",
  );
  expect(embedded).toEqual([
    { id: originalId, measurement_revisions: [{ version: 1 }, { version: 2 }] },
  ]);
  const originalRevisions = await rows(revisions, "coach");
  expect(originalRevisions).toHaveLength(2);
  expect(originalRevisions[0]).toMatchObject({
    version: 1,
    previous_value: 72,
    corrected_by: account("coach").id,
  });
  expect(originalRevisions[1]).toEqual({
    version: 2,
    previous_value: originalRevisions[0].new_value,
    new_value: 75,
    corrected_by: account("client").id,
  });
  expect(
    (await rows(historyPath, "client")).find(
      (row: { id: string }) => row.id === originalId,
    ).original_value,
  ).toBe(72);
  expect(
    (
      await data("measurements?id=eq." + originalId, "client", {
        method: "PATCH",
        body: JSON.stringify({ original_value: 100 }),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await data(
        "measurement_revisions?measurement_id=eq." + originalId,
        "client",
        {
          method: "DELETE",
        },
      )
    ).status,
  ).toBe(403);
  expect((await consent("measurement_read", false)).ok).toBe(true);
  expect(await rows(historyPath, "coach")).toEqual([]);
  expect(await rows(revisions, "coach")).toEqual([]);
  expect(
    (
      await rpc(
        "correct_measurement",
        { ...correction, expected_version: 2 },
        "coach",
      )
    ).status,
  ).toBe(403);
  expect((await consent("measurement_read")).ok).toBe(true);
});

test("canje atómico y específico de una emisión sin vincular cuentas existentes", async () => {
  const digest = (secret: string) =>
    createHash("sha256").update(secret).digest("hex");
  const issue = async (
    suffix: string,
    options: { predecessor?: string; existing?: string } = {},
  ) => {
    const email =
      options.existing ?? "invite-" + runId + "-" + suffix + "@example.invalid";
    const hash = digest(randomUUID());
    const result = await rpc(
      "issue_client_invitation",
      {
        actor: account("coach").id,
        membership: membership.coach,
        recipient: email,
        secret_hash: hash,
        predecessor: options.predecessor ?? null,
      },
      "admin",
    );
    expect(result.ok).toBe(true);
    const [record] = (await result.json()) as {
      invitation_id: string;
      email_address: string;
    }[];
    return { id: record.invitation_id, email: record.email_address, hash };
  };
  const redeem = ({
    id,
    email,
    hash,
  }: {
    id: string;
    email: string;
    hash: string;
  }) =>
    auth(
      "/admin/users",
      {
        email,
        password,
        email_confirm: true,
        app_metadata: { _gym_invitation: { id, hash } },
      },
      true,
    );

  const denied = await rpc(
    "issue_client_invitation",
    {
      actor: account("coach").id,
      membership: membership.coach,
      recipient: runId + "@example.invalid",
      secret_hash: digest(randomUUID()),
      predecessor: null,
    },
    "coach",
  );
  expect(denied.ok).toBe(false);
  const expired = await issue("expired");
  await sql!`update gym_private.client_invitations set created_at = created_at - interval '72 hours',
    expires_at = expires_at - interval '72 hours' where id = ${expired.id}`;
  expect((await redeem(expired)).ok).toBe(false);
  const revoked = await issue("revoked");
  expect(
    (
      await rpc(
        "revoke_client_invitation",
        { invitation: revoked.id },
        "colleague",
      )
    ).status,
  ).toBe(403);
  expect(
    (await rpc("revoke_client_invitation", { invitation: revoked.id }, "coach"))
      .ok,
  ).toBe(true);
  expect((await redeem(revoked)).ok).toBe(false);

  const previous = await issue("reissued");
  const latest = await issue("reissued", { predecessor: previous.id });
  expect((await redeem(previous)).ok).toBe(false);
  expect((await redeem({ ...latest, hash: previous.hash })).ok).toBe(false);
  expect((await redeem({ ...latest, email: expired.email })).ok).toBe(false);
  const duration =
    await sql!`select extract(epoch from (expires_at - created_at))::int as seconds
    from gym_private.client_invitations where id = ${latest.id}`;
  expect(duration[0].seconds).toBe(48 * 3600);
  const responses = await Promise.all([redeem(latest), redeem(latest)]);
  expect(responses.filter(({ ok }) => ok)).toHaveLength(1);
  expect((await redeem(latest)).ok).toBe(false);
  const activated =
    await sql!`select i.state, u.raw_app_meta_data ? '_gym_invitation' as proof_retained,
      (select count(*)::int from gym_private.coach_client_relationships where client_id = c.id) as relationships,
      (select count(*)::int from gym_private.client_authorizations as a
       join gym_private.coach_client_relationships as r on r.id = a.relationship_id where r.client_id = c.id) as consents
    from gym_private.client_invitations as i join auth.users as u on u.id = i.consumed_by
    join gym_api.clients as c on c.profile_id = u.id where i.id = ${latest.id}`;
  expect([...activated]).toEqual([
    { state: "consumed", proof_retained: false, relationships: 1, consents: 0 },
  ]);
  const existing = await issue("existing", {
    existing: "unprovisioned-" + runId + "@example.invalid",
  });
  expect((await redeem(existing)).ok).toBe(false);
  const [unlinked] = await sql!`select
    (select count(*)::int from gym_api.clients where profile_id = ${account("unprovisioned").id}) as clients,
    (select state from gym_private.client_invitations where id = ${existing.id}) as state`;
  expect(unlinked).toEqual({ clients: 0, state: "pending" });
  const [created] = await sql!`select count(*)::int as total from auth.users
    where email like ${"invite-" + runId + "-%@example.invalid"}`;
  expect(created.total).toBe(1);
});

test("la revocación y el cambio de coach surten efecto con los JWT originales", async () => {
  const db = sql!;
  expect(await rows(target, "coach")).toEqual([{ id: client.id }]);

  await db`update gym_private.client_authorizations set revoked_at = statement_timestamp()
    where relationship_id = ${relationship.current}`;
  expect(await rows(target, "coach")).toEqual([]);
  expect(await rows(historyPath, "coach")).toEqual([]);
  expect(await rows(historyPath, "client")).toHaveLength(2);
  expect(await rows(target, "client")).toEqual([{ id: client.id }]);

  await db`insert into gym_private.client_authorizations (relationship_id, scope, valid_from, expires_at)
    values (${relationship.current}, 'client_record_read',
      statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour')`;
  expect(await rows(target, "coach")).toEqual([]);

  await db`insert into gym_private.client_authorizations (relationship_id, scope)
    values (${relationship.current}, 'client_record_read')`;
  expect(await rows(target, "coach")).toEqual([{ id: client.id }]);
  await db`update gym_api.coach_memberships set ended_at = statement_timestamp()
    where id = ${membership.coach}`;
  expect(await rows(target, "coach")).toEqual([]);
  await db`update gym_api.coach_memberships set ended_at = null where id = ${membership.coach}`;
  expect(await rows(target, "coach")).toEqual([{ id: client.id }]);

  await db.begin(async (tx) => {
    await tx`update gym_private.coach_client_relationships set ended_at = statement_timestamp()
      where id = ${relationship.current}`;
    await tx`insert into gym_private.coach_client_relationships (id, client_id, coach_membership_id)
      values (${relationship.next}, ${client.id}, ${membership.nextCoach})`;
  });
  expect(await rows(target, "coach")).toEqual([]);
  expect(await rows(target, "nextCoach")).toEqual([]);
  expect(await rows(historyPath, "nextCoach")).toEqual([]);
  expect(await rows(historyPath, "coach")).toEqual([]);
  expect((await consent("measurement_read", true, relationship.next)).ok).toBe(
    true,
  );
  expect(await rows(historyPath, "nextCoach")).toHaveLength(2);
  expect((await consent("measurement_read", false, relationship.next)).ok).toBe(
    true,
  );
  expect(await rows(historyPath, "nextCoach")).toEqual([]);

  await db`insert into gym_private.client_authorizations (relationship_id, scope)
    values (${relationship.next}, 'client_record_read')`;
  expect(await rows(target, "nextCoach")).toEqual([{ id: client.id }]);
  expect(await rows(target, "coach")).toEqual([]);
  expect(await rows(target, "client")).toEqual([{ id: client.id }]);
});

test("la unicidad global resiste inserciones concurrentes entre organizaciones", async () => {
  const db = sql!;
  const raceClient = randomUUID();
  await db`insert into gym_api.profiles (id) values (${account("unprovisioned").id})`;
  await db`insert into gym_api.clients (id, profile_id)
    values (${raceClient}, ${account("unprovisioned").id})`;

  const rival = await db.reserve();
  let rivalOutcome: Promise<unknown> | undefined;
  try {
    const [{ pid }] = await rival<
      { pid: number }[]
    >`select pg_backend_pid() as pid`;
    await db.begin(async (tx) => {
      await tx`insert into gym_private.coach_client_relationships (client_id, coach_membership_id)
        values (${raceClient}, ${membership.coach})`;
      rivalOutcome =
        rival`insert into gym_private.coach_client_relationships (client_id, coach_membership_id)
        values (${raceClient}, ${membership.nextCoach})`.then(
          () => null,
          (error: unknown) => error,
        );

      // Verify that both connections overlap before committing the first insert.
      const deadline = Date.now() + 5_000;
      do {
        const [{ blocked }] = await tx<{ blocked: boolean }[]>`
          select pg_backend_pid() = any(pg_blocking_pids(${pid})) as blocked`;
        if (blocked) return;
        await sleep(25);
      } while (Date.now() < deadline);
      throw new Error(
        "La segunda conexión no esperó el bloqueo del índice único",
      );
    });
    expect(await rivalOutcome).toMatchObject({
      code: "23505",
      constraint_name: "one_active_coach_per_client",
    });
  } finally {
    await rivalOutcome;
    rival.release();
    await db`delete from gym_private.coach_client_relationships where client_id = ${raceClient}`;
    await db`delete from gym_api.clients where id = ${raceClient}`;
  }
});
