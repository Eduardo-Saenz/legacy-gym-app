"use server";

import { revalidatePath } from "next/cache";
import { verifiedSession } from "@/server/session";
import { field, isoDate, type ActionState, uuid } from "@/modules/access/input";
import { scopes } from "./records";

export async function saveProfile(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await verifiedSession(true);
  const target = field(form, "client");
  const name = field(form, "name").trim();
  const birthDate = field(form, "birthDate");
  if (
    !uuid(target) ||
    !name ||
    name.length > 120 ||
    (birthDate && !isoDate(birthDate))
  ) {
    return { error: "Revisa el nombre y la fecha de nacimiento." };
  }
  const { error } = await db.schema("gym_api").rpc("save_client_details", {
    target,
    name_value: name,
    date_value: birthDate || null,
  });
  if (error) return { error: "No se pudo guardar la ficha." };
  revalidatePath("/cliente");
  revalidatePath("/coach");
  revalidatePath("/coach/clientes/" + target);
  return { message: "Ficha guardada." };
}

export async function changeConsent(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await verifiedSession(true);
  const target = field(form, "client");
  const relationship = field(form, "relationship");
  const scope = field(form, "scope");
  const decision = field(form, "decision");
  if (
    !uuid(target) ||
    !uuid(relationship) ||
    !Object.hasOwn(scopes, scope) ||
    !["allow", "revoke"].includes(decision)
  )
    return { error: "Autorización no válida." };
  const { error } = await db.schema("gym_api").rpc("set_client_consent", {
    target,
    relationship,
    scope_value: scope,
    allow: decision === "allow",
  });
  if (error) return { error: "No se pudo cambiar la autorización." };
  revalidatePath("/cliente");
  revalidatePath("/coach");
  revalidatePath("/coach/clientes/" + target);
  return {
    message:
      decision === "allow"
        ? "Autorización concedida."
        : "Autorización revocada.",
  };
}
