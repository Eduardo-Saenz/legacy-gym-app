import postgres from "postgres";
import { localSupabase } from "./local-supabase.mjs";

const email = process.env.LEGACY_COACH_EMAIL?.trim().toLowerCase();
const password = process.env.LEGACY_COACH_PASSWORD;
const organization =
  process.env.LEGACY_COACH_ORG_ID ?? "ef8e61fc-e4f9-4d5a-83b7-0c22c6b52798";

async function provision() {
  if (
    !email ||
    !/^[a-z0-9._+-]+@example\.invalid$/.test(email) ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  ) {
    console.error(
      "Usa un correo ficticio example.invalid y una contraseña de al menos 12 caracteres y un máximo de 72 bytes.",
    );
    process.exitCode = 1;
    return;
  }

  const status = localSupabase();
  const db = postgres(status.DB_URL, { connect_timeout: 5, max: 1 });
  try {
    const find =
      () => db`select id, raw_app_meta_data ->> '_gym_local_coach' as marker from auth.users
      where lower(email) = ${email}`;
    let [user] = await find();
    if (!user) {
      const key = status.SERVICE_ROLE_KEY;
      const response = await fetch(status.API_URL + "/auth/v1/admin/users", {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          app_metadata: { _gym_local_coach: organization },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      [user] = await find();
    }
    if (user?.marker !== organization) {
      throw new Error("Cuenta preexistente o aprovisionamiento rechazado");
    }
    await db.begin(async (tx) => {
      await tx`insert into gym_api.organizations (id, name) values (${organization}, 'Gimnasio ficticio')
        on conflict (id) do nothing`;
      await tx`insert into gym_api.profiles (id) values (${user.id}) on conflict do nothing`;
      await tx`insert into gym_api.coach_memberships (coach_id, organization_id)
        values (${user.id}, ${organization}) on conflict (coach_id, organization_id) do nothing`;
    });
    console.log("Coach ficticio aprovisionado.");
  } finally {
    await db.end();
  }
}

try {
  await provision();
} catch {
  console.error(
    "No se pudo aprovisionar el coach. Comprueba la instancia local y usa una cuenta ficticia nueva.",
  );
  process.exitCode = 1;
}
