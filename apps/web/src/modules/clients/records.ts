import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const scopes = {
  client_record_read: "Consultar mi ficha",
  client_profile_write: "Editar mi ficha",
  measurement_read: "Consultar todo mi historial de mediciones y revisiones",
  measurement_write: "Registrar mediciones",
  measurement_correct: "Corregir mediciones",
};
export type Scope = keyof typeof scopes;
export type ActiveClient = {
  client_id: string;
  full_name: string | null;
  scopes: Scope[];
};
export type ClientDetails = { full_name: string; birth_date: string | null };
export type Consent = {
  relationship_id: string;
  coach_id: string;
  organization_name: string;
  scope: Scope | null;
  granted_at: string | null;
};

export async function activeClients(
  db: SupabaseClient,
): Promise<ActiveClient[]> {
  const { data, error } = await db.schema("gym_api").rpc("active_clients");
  if (error) throw new Error("No se pudo consultar la lista de clientes");
  return data;
}

export async function ownClient(db: SupabaseClient, actor: string) {
  const { data, error } = await db
    .schema("gym_api")
    .from("clients")
    .select("id")
    .eq("profile_id", actor)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error("No se pudo consultar la cuenta");
  return data;
}

export async function clientDetails(
  db: SupabaseClient,
  target: string,
): Promise<ClientDetails | null> {
  const { data, error } = await db
    .schema("gym_api")
    .from("client_details")
    .select("full_name,birth_date")
    .eq("client_id", target)
    .maybeSingle<ClientDetails>();
  if (error) throw new Error("No se pudo consultar la ficha");
  return data;
}

export async function clientConsents(
  db: SupabaseClient,
  target: string,
): Promise<Consent[]> {
  const { data, error } = await db
    .schema("gym_api")
    .rpc("client_consents", { target });
  if (error) throw new Error("No se pudieron consultar las autorizaciones");
  return data;
}

export async function coachMemberships(db: SupabaseClient, actor: string) {
  const { data, error } = await db
    .schema("gym_api")
    .from("coach_memberships")
    .select("id,organizations(name)")
    .eq("coach_id", actor)
    .returns<{ id: string; organizations: { name: string } | null }[]>();
  if (error) throw new Error("No se pudo consultar la organización");
  return data;
}

export type CoachInvitation = {
  id: string;
  email: string;
  state: string;
  delivery: string;
  expires_at: string;
  organization_name: string;
};

export async function coachInvitations(
  db: SupabaseClient,
): Promise<CoachInvitation[]> {
  const { data, error } = await db.schema("gym_api").rpc("coach_invitations");
  if (error) throw new Error("No se pudieron consultar las invitaciones");
  return data;
}
