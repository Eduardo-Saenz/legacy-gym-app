import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { invitationAdmin } from "@/server/admin";
import { localOrigin, mailpitUrl } from "@/server/settings";

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueInvitation(
  actor: string,
  request: { membership: string; email: string } | { predecessor: string },
) {
  const admin = invitationAdmin().schema("gym_api");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin
    .rpc("issue_client_invitation", {
      actor,
      membership: "membership" in request ? request.membership : null,
      recipient: "email" in request ? request.email : null,
      secret_hash: digest(token),
      predecessor: "predecessor" in request ? request.predecessor : null,
    })
    .single<{ invitation_id: string; email_address: string }>();
  if (error || !data) return { issued: false, delivered: false };

  const link =
    localOrigin() + "/activar#id=" + data.invitation_id + "&token=" + token;
  let delivered = false;
  try {
    const response = await fetch(mailpitUrl + "/api/v1/send", {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: "invitaciones@example.invalid", Name: "Legacy Gym App" },
        To: [{ Email: data.email_address }],
        Subject: "Invitación a Legacy Gym App",
        Text:
          "Abre este enlace y confirma tu activación en las próximas 48 horas:\n" +
          link,
        HTML:
          '<p>Abre el enlace y confirma tu activación en las próximas 48 horas.</p><p><a href="' +
          link.replace("&", "&amp;") +
          '">Activar mi cuenta</a></p>',
      }),
    });
    delivered = response.ok;
    await response.body?.cancel();
  } catch {
    // The database retains the emission so the coach can retry by resending.
  }
  await admin.rpc("set_invitation_delivery", {
    invitation: data.invitation_id,
    delivered,
  });
  return { issued: true, delivered };
}

export async function activateInvitation(
  id: string,
  token: string,
  email: string,
  password: string,
) {
  const admin = invitationAdmin();
  const hash = digest(token);
  const preflight = await admin
    .schema("gym_api")
    .rpc("can_attempt_client_invitation", {
      invitation: id,
      secret_hash: hash,
      recipient: email,
    });
  if (preflight.error || preflight.data !== true) return false;

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { _gym_invitation: { id, hash } },
  });
  return !error;
}
