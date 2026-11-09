import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
    await sql.begin(async (tx) => {
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
    for (const { id } of accounts.values()) {
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

test("la revocación y el cambio de coach surten efecto con los JWT originales", async () => {
  const db = sql!;
  expect(await rows(target, "coach")).toEqual([{ id: client.id }]);

  await db`update gym_private.client_authorizations set revoked_at = statement_timestamp()
    where relationship_id = ${relationship.current}`;
  expect(await rows(target, "coach")).toEqual([]);
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
