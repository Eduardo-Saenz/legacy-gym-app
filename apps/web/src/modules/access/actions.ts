"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessionClient, verifiedSession } from "@/server/session";
import { localOrigin } from "@/server/settings";
import {
  emailAddress,
  field,
  type ActionState,
  uuid,
  validPassword,
} from "./input";
import { activateInvitation, issueInvitation } from "./invitations";

export async function signIn(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = emailAddress(field(form, "email"));
  const password = field(form, "password");
  if (!email || !password || new TextEncoder().encode(password).length > 72)
    return { error: "Revisa el correo y la contraseña." };
  const db = await sessionClient(true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "No pudimos iniciar sesión con esos datos." };
  redirect("/cuenta");
}

export async function signOut() {
  const db = await sessionClient(true);
  await db.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

export async function requestRecovery(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = emailAddress(field(form, "email"));
  if (!email) return { error: "Escribe un correo válido." };
  const db = await sessionClient(true);
  await db.auth.resetPasswordForEmail(email, {
    redirectTo: localOrigin() + "/recuperar/cambiar",
  });
  return {
    message: "Si el correo puede recuperar su cuenta, recibirá instrucciones.",
  };
}

export async function recoverPassword(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = field(form, "token");
  const password = field(form, "password");
  if (!/^(pkce_)?[a-f0-9]{40,128}$/i.test(token))
    return { error: "Abre el enlace de recuperación del correo." };
  if (!validPassword(password))
    return {
      error:
        "La contraseña debe tener al menos 12 caracteres y un máximo de 72 bytes.",
    };
  const db = await sessionClient(true);
  const { error } = await db.auth.verifyOtp({
    token_hash: token,
    type: "recovery",
  });
  if (error) return { error: "El enlace ya no es válido. Solicita otro." };
  const updated = await db.auth.updateUser({ password });
  if (updated.error) {
    await db.auth.signOut({ scope: "local" });
    return { error: "No se pudo cambiar la contraseña. Solicita otro enlace." };
  }
  await db.auth.signOut({ scope: "local" });
  redirect("/entrar?recuperada=1");
}

export async function activate(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = emailAddress(field(form, "email"));
  const password = field(form, "password");
  const id = field(form, "id");
  const token = field(form, "token");
  if (!uuid(id) || !/^[a-zA-Z0-9_-]{43}$/.test(token))
    return { error: "Abre el enlace de invitación del correo." };
  if (!email || !validPassword(password))
    return {
      error:
        "Revisa el correo y usa una contraseña de al menos 12 caracteres y un máximo de 72 bytes.",
    };

  if (!(await activateInvitation(id, token, email, password))) {
    return {
      error:
        "La invitación no está disponible para estos datos. Contacta a tu coach.",
    };
  }
  const db = await sessionClient(true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  redirect(error ? "/entrar?activada=1" : "/cuenta");
}

export async function invite(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { actor } = await verifiedSession(true);
  const email = emailAddress(field(form, "email"));
  const membership = field(form, "membership");
  if (!email || !uuid(membership))
    return { error: "Selecciona una organización y escribe un correo válido." };
  const result = await issueInvitation(actor, { membership, email });
  revalidatePath("/coach");
  return invitationResult(result);
}

export async function resend(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { actor } = await verifiedSession(true);
  const predecessor = field(form, "invitation");
  if (!uuid(predecessor)) return { error: "Invitación no disponible." };
  const result = await issueInvitation(actor, { predecessor });
  revalidatePath("/coach");
  return invitationResult(result);
}

function invitationResult(result: {
  issued: boolean;
  delivered: boolean;
}): ActionState {
  if (!result.issued)
    return {
      error:
        "No se pudo emitir la invitación. Revisa las pendientes y el límite de envíos.",
    };
  if (!result.delivered)
    return {
      error:
        "Se registró la invitación. Usa Reenviar para intentar entregar el correo otra vez.",
    };
  return { message: "Correo enviado a Mailpit." };
}

export async function revokeInvitation(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await verifiedSession(true);
  const invitation = field(form, "invitation");
  if (!uuid(invitation)) return { error: "Invitación no disponible." };
  const { error } = await db
    .schema("gym_api")
    .rpc("revoke_client_invitation", { invitation });
  if (error) return { error: "No se pudo revocar la invitación." };
  revalidatePath("/coach");
  return { message: "Invitación revocada." };
}
