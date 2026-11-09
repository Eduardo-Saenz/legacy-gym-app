import { expect, test } from "@playwright/test";

test("sirve la portada y el contrato de salud desde la compilación", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Legacy Gym App" }),
  ).toBeVisible();
  const response = await request.get("/api/v1/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
