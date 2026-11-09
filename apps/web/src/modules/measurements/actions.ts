"use server";

import { revalidatePath } from "next/cache";
import { verifiedSession } from "@/server/session";
import { field, type ActionState, uuid } from "@/modules/access/input";
import { correction, newMeasurement } from "./input";
import { correctMeasurement, recordMeasurement } from "./records";

export async function register(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await verifiedSession(true);
  const target = field(form, "client");
  const [kind, unit] = field(form, "kind").split(":");
  const input = newMeasurement(
    kind,
    unit,
    field(form, "value"),
    field(form, "measuredOn"),
  );
  if (!uuid(target) || !input)
    return { error: "Revisa el valor, la unidad y la fecha de medición." };
  const { error } = await recordMeasurement(db, target, input);
  if (error) return { error: "No se pudo registrar la medición." };
  revalidatePath("/cliente");
  revalidatePath("/coach/clientes/" + target);
  return { message: "Medición registrada." };
}

export async function revise(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { db } = await verifiedSession(true);
  const target = field(form, "client");
  const input = correction(
    field(form, "measurement"),
    field(form, "version"),
    field(form, "value"),
    field(form, "reason"),
  );
  if (!uuid(target) || !input)
    return { error: "Revisa el valor y el motivo de corrección." };
  const { error } = await correctMeasurement(db, target, input);
  if (error?.code === "PT409")
    return {
      error: "La medición cambió. Recarga la página y vuelve a intentarlo.",
    };
  if (error)
    return {
      error: "No se pudo corregir la medición. Revisa el valor y tus permisos.",
    };
  revalidatePath("/cliente");
  revalidatePath("/coach/clientes/" + target);
  return { message: "Corrección guardada." };
}
