import { expect, test } from "vitest";
import { GET } from "./route";

test("responde con el contrato de salud de la web", async () => {
  const response = GET();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ status: "ok" });
});
