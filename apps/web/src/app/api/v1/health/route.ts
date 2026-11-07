type HealthResponse = { status: "ok" };

export function GET(): Response {
  return Response.json({ status: "ok" } satisfies HealthResponse);
}
