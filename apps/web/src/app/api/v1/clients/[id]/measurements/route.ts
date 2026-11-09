import { bearerClient } from "@/server/session";
import { uuid } from "@/modules/access/input";
import { activeClients, ownClient } from "@/modules/clients/records";
import { correction, newMeasurement } from "@/modules/measurements/input";
import {
  correctMeasurement,
  measurements,
  recordMeasurement,
} from "@/modules/measurements/records";

type Context = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function handle(request: Request, context: Context) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  const session = token ? await bearerClient(token) : null;
  if (!session) return json({ error: "unauthenticated" }, 401);
  const { db, actor } = session;
  const { id } = await context.params;
  if (!uuid(id)) return json({ error: "not_found" }, 404);

  if (request.method === "GET") {
    const owned = await ownClient(db, actor);
    const canRead =
      owned?.id === id ||
      (await activeClients(db)).some(
        (entry) =>
          entry.client_id === id && entry.scopes.includes("measurement_read"),
      );
    return canRead
      ? json({ measurements: await measurements(db, id) })
      : json({ error: "not_found" }, 404);
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || !body || Array.isArray(body))
    return json({ error: "invalid_input" }, 400);
  const fields = body as Record<string, unknown>;

  if (request.method === "POST") {
    const input = newMeasurement(
      fields.kind,
      fields.unit,
      fields.value,
      fields.measuredOn,
    );
    if (!input) return json({ error: "invalid_input" }, 400);
    const { data, error } = await recordMeasurement(db, id, input);
    if (!error) return json({ id: data }, 201);
    return json(
      { error: error.code === "42501" ? "not_found" : "invalid_input" },
      error.code === "42501" ? 404 : 400,
    );
  }

  const input = correction(
    fields.measurementId,
    fields.version,
    fields.value,
    fields.reason,
  );
  if (!input) return json({ error: "invalid_input" }, 400);
  const { data, error } = await correctMeasurement(db, id, input);
  if (!error) return json({ version: data });
  if (error.code === "PT409") return json({ error: "version_conflict" }, 409);
  if (error.code === "42501") return json({ error: "not_found" }, 404);
  return json({ error: "invalid_input" }, 400);
}

export { handle as GET, handle as POST, handle as PATCH };
