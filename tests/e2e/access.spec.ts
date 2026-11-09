import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

test.skip(
  process.env.LEGACY_E2E_ACCESS !== "1",
  "Requiere Supabase y Mailpit locales.",
);

const tag = randomUUID();
const coachEmail = "coach-" + tag + "@example.invalid";
const clientEmail = "cliente-" + tag + "@example.invalid";
const organization = randomUUID();
const password = "Fixture-" + randomUUID();
const newPassword = "Fixture-" + randomUUID();
const api = "http://127.0.0.1:54321";
const mailpit = "http://127.0.0.1:54324/api/v1";
const mailIds = new Set<string>();
let status: {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

test.beforeAll(() => {
  status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const database = new URL(status.DB_URL);
  if (status.API_URL !== api || database.host !== "127.0.0.1:54322") {
    throw new Error("Se requiere Supabase local para el flujo de navegador");
  }
  const provision = {
    ...process.env,
    LEGACY_COACH_EMAIL: coachEmail,
    LEGACY_COACH_PASSWORD: password,
    LEGACY_COACH_ORG_ID: organization,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    execFileSync(process.execPath, ["scripts/provision-local-coach.mjs"], {
      env: provision,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
});

test.afterAll(async () => {
  if (!status) return;
  const db = postgres(status.DB_URL, { max: 1, connect_timeout: 5 });
  try {
    const users = await db<
      { id: string }[]
    >`select id from auth.users where email in (${coachEmail}, ${clientEmail})`;
    const ids = users.map(({ id }) => id);
    if (ids.length) {
      await db.begin(async (tx) => {
        const clients = await tx<
          { id: string }[]
        >`select id from gym_api.clients where profile_id in ${tx(ids)}`;
        const clientIds = clients.map(({ id }) => id);
        if (clientIds.length) {
          await tx`delete from gym_api.measurement_revisions where client_id in ${tx(clientIds)}`;
          await tx`delete from gym_api.measurements where client_id in ${tx(clientIds)}`;
          await tx`delete from gym_private.client_profile_edits where client_id in ${tx(clientIds)}`;
          await tx`delete from gym_api.client_details where client_id in ${tx(clientIds)}`;
          await tx`delete from gym_private.client_authorizations where relationship_id in
            (select id from gym_private.coach_client_relationships where client_id in ${tx(clientIds)})`;
          await tx`delete from gym_private.coach_client_relationships where client_id in ${tx(clientIds)}`;
          await tx`delete from gym_api.clients where id in ${tx(clientIds)}`;
        }
        await tx`delete from gym_private.client_invitations where coach_membership_id in
          (select id from gym_api.coach_memberships where organization_id = ${organization})`;
        await tx`delete from gym_api.coach_memberships where organization_id = ${organization}`;
        await tx`delete from gym_api.organizations where id = ${organization}`;
        await tx`delete from gym_api.profiles where id in ${tx(ids)}`;
      });
      const key = status.SERVICE_ROLE_KEY;
      for (const id of ids) {
        const response = await fetch(api + "/auth/v1/admin/users/" + id, {
          method: "DELETE",
          headers: { apikey: key, Authorization: "Bearer " + key },
        });
        expect(response.ok).toBe(true);
      }
    }
    for (const id of mailIds) {
      await fetch(mailpit + "/message/" + id, { method: "DELETE" });
    }
  } finally {
    await db.end();
  }
});

async function openMailLink(page: Page, subject: string, path: string) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          mailpit + "/search?query=" + encodeURIComponent("to:" + clientEmail),
        );
        if (!response.ok) return false;
        const { messages } = (await response.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        id = messages.find((message) => message.Subject === subject)?.ID;
        return Boolean(id);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  if (!id) throw new Error("Falta el correo ficticio");
  mailIds.add(id);
  const message = (await (await fetch(mailpit + "/message/" + id)).json()) as {
    HTML: string;
  };
  const href = message.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll(
    "&amp;",
    "&",
  );
  const url = href ? new URL(href) : null;
  if (
    !url ||
    url.origin !== "http://127.0.0.1:3100" ||
    url.pathname !== path ||
    !url.hash
  ) {
    throw new Error("El correo no contiene el enlace local esperado");
  }
  await page.goto(path);
  await page.evaluate((fragment) => {
    window.location.hash = fragment;
  }, url.hash);
}

async function signIn(page: Page, email: string, secret: string) {
  await page.goto("/entrar");
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("invitación, ficha, consentimiento, corrección y recuperación de contraseña", async ({
  page: coach,
  browser,
}) => {
  test.setTimeout(90_000);
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  try {
    await client.goto("/coach");
    await expect(
      client.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await signIn(coach, coachEmail, password);
    await expect(
      coach.getByRole("heading", { name: "Portal del coach" }),
    ).toBeVisible();
    await coach.getByLabel("Correo del cliente").fill(clientEmail);
    await coach.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(coach.getByText("Correo enviado a Mailpit.")).toBeVisible();

    await openMailLink(client, "Invitación a Legacy Gym App", "/activar");
    await expect(
      client.getByRole("heading", { name: "Activar tu cuenta" }),
    ).toBeVisible();
    await coach.reload();
    await expect(
      coach.getByText(/Pendiente · Entregada a Mailpit/),
    ).toBeVisible();
    await client.getByLabel("Correo de la invitación").fill(clientEmail);
    await client.getByLabel("Nueva contraseña").fill(password);
    await client.getByRole("button", { name: "Activar cuenta" }).click();
    await expect(
      client.getByRole("heading", { name: "Portal del cliente" }),
    ).toBeVisible();
    await client.goto("/coach");
    await expect(
      client.getByRole("heading", { name: "Portal del cliente" }),
    ).toBeVisible();

    await client.getByLabel("Nombre", { exact: true }).fill("Cliente ficticio");
    await client
      .getByLabel("Fecha de nacimiento (opcional)")
      .fill("1995-05-05");
    await client.getByRole("button", { name: "Guardar ficha" }).click();
    await expect(client.getByText("Ficha guardada.")).toBeVisible();
    await client.getByLabel("Valor", { exact: true }).fill("73.5");
    await client.getByLabel("Fecha de medición").fill("2025-01-15");
    await client.getByRole("button", { name: "Guardar medición" }).click();
    await expect(
      client.getByRole("heading", { name: "Peso · 73.5 kg" }),
    ).toBeVisible();

    await coach.reload();
    const link = coach.getByRole("link", { name: /^Cliente [a-f0-9]{8}$/ });
    const detailPath = await link.getAttribute("href");
    if (!detailPath) throw new Error("Falta el enlace al cliente ficticio");
    await link.click();
    await expect(
      coach.getByRole("heading", { name: "Acceso pendiente" }),
    ).toBeVisible();
    await expect(
      coach.getByRole("heading", { name: "Historial de mediciones" }),
    ).toHaveCount(0);
    await coach.goto("/coach/clientes/" + randomUUID());
    await expect(coach.getByRole("heading", { name: "404" })).toBeVisible();

    for (const name of [
      "Consultar mi ficha",
      "Editar mi ficha",
      "Consultar todo mi historial de mediciones y revisiones",
      "Corregir mediciones",
    ]) {
      const grant = client
        .getByRole("heading", { name, exact: true })
        .locator("..");
      await grant
        .getByRole("button", { name: "Conceder autorización" })
        .click();
      await expect(
        grant.getByRole("button", { name: "Revocar autorización" }),
      ).toBeVisible();
    }

    await coach.goto(detailPath);
    await expect(
      coach.getByRole("heading", { name: "Cliente ficticio", exact: true }),
    ).toBeVisible();
    await coach
      .getByLabel("Nombre", { exact: true })
      .fill("Cliente ficticio actualizado");
    await coach.getByRole("button", { name: "Guardar ficha" }).click();
    await expect(coach.getByText("Ficha guardada.")).toBeVisible();
    await coach.getByText("Corregir medición", { exact: true }).click();
    await coach.getByLabel("Valor corregido (kg)").fill("74");
    await coach.getByLabel("Motivo").fill("Corrección ficticia");
    await coach.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(
      coach.getByRole("heading", { name: "Peso · 74 kg" }),
    ).toBeVisible();

    await client.reload();
    await expect(client.getByLabel("Nombre", { exact: true })).toHaveValue(
      "Cliente ficticio actualizado",
    );
    await client.getByText("Revisiones (1)", { exact: true }).click();
    await expect(
      client.getByText("73.5 → 74 kg · Corrección ficticia"),
    ).toBeVisible();
    const historyGrant = client
      .getByRole("heading", {
        name: "Consultar todo mi historial de mediciones y revisiones",
      })
      .locator("..");
    await historyGrant
      .getByRole("button", { name: "Revocar autorización" })
      .click();
    await expect(
      historyGrant.getByRole("button", { name: "Conceder autorización" }),
    ).toBeVisible();
    await coach.reload();
    await expect(
      coach.getByRole("heading", { name: "Historial de mediciones" }),
    ).toHaveCount(0);

    const login = await fetch(api + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: clientEmail, password }),
    });
    expect(login.ok).toBe(true);
    const { access_token } = (await login.json()) as { access_token: string };
    const contract =
      "/api/v1/clients/" + detailPath.split("/").at(-1) + "/measurements";
    expect((await client.request.get(contract)).status()).toBe(401);
    const apiResponse = await client.request.get(contract, {
      headers: { Authorization: "Bearer " + access_token },
    });
    expect(apiResponse.status()).toBe(200);
    expect((await apiResponse.json()).measurements[0]).toMatchObject({
      currentValue: 74,
      version: 1,
    });

    await client.getByRole("button", { name: "Cerrar sesión" }).click();
    await client.getByRole("link", { name: "Olvidé mi contraseña" }).click();
    await client.getByLabel("Correo", { exact: true }).fill(clientEmail);
    await client.getByRole("button", { name: "Enviar correo" }).click();
    await expect(client.getByRole("status")).toHaveText(
      /recibirá instrucciones/,
    );
    await clientContext.clearCookies();
    await openMailLink(
      client,
      "Cambia tu contraseña en Legacy Gym App",
      "/recuperar/cambiar",
    );
    await client.getByLabel("Nueva contraseña").fill(newPassword);
    await client.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      client.getByText("Contraseña actualizada. Inicia sesión de nuevo."),
    ).toBeVisible();
    await signIn(client, clientEmail, newPassword);
    await expect(
      client.getByRole("heading", { name: "Portal del cliente" }),
    ).toBeVisible();
    await client.goto("/coach");
    await expect(
      client.getByRole("heading", { name: "Portal del cliente" }),
    ).toBeVisible();
    await expect(
      client.getByRole("heading", { name: "Peso · 74 kg" }),
    ).toBeVisible();
  } finally {
    await clientContext.close();
  }
});
