import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Panel, Portal } from "@/components/portal";
import { invite, resend, revokeInvitation } from "@/modules/access/actions";
import {
  activeClients,
  coachInvitations,
  coachMemberships,
} from "@/modules/clients/records";
import { verifiedSession } from "@/server/session";

const invitationStates: Record<string, string> = {
  pending: "Pendiente",
  consumed: "Consumida",
  revoked: "Revocada",
  superseded: "Reemplazada",
  expired: "Vencida",
};
const deliveryStates: Record<string, string> = {
  pending: "Entrega pendiente",
  sent: "Entregada a Mailpit",
  failed: "Falló el envío",
};

export default async function CoachPage() {
  const { db, actor } = await verifiedSession();
  const memberships = await coachMemberships(db, actor);
  if (!memberships.length) redirect("/cuenta");
  const [clients, invitations] = await Promise.all([
    activeClients(db),
    coachInvitations(db),
  ]);
  return (
    <Portal title="Portal del coach" back="/coach">
      <Panel title="Clientes activos">
        {!clients.length && <p>Todavía no tienes clientes activos.</p>}
        <ul className="grid gap-2">
          {clients.map((client) => (
            <li key={client.client_id}>
              <Link href={"/coach/clientes/" + client.client_id}>
                {client.full_name ?? "Cliente " + client.client_id.slice(0, 8)}
              </Link>
              {!client.scopes.length && (
                <span className="ml-2 text-sm text-slate-300">
                  Sin autorizaciones
                </span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Invitar a un cliente">
        <ActionForm action={invite} label="Enviar invitación">
          <label>
            Organización{" "}
            <select name="membership" required>
              {memberships.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.organizations?.name ?? "Organización"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Correo del cliente <input type="email" name="email" required />
          </label>
        </ActionForm>
      </Panel>
      <Panel title="Invitaciones">
        {!invitations.length && <p>Todavía no has enviado invitaciones.</p>}
        <ul className="grid gap-4">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="grid gap-2 border-b border-slate-700 pb-3"
            >
              <h3 className="break-all font-semibold">{invitation.email}</h3>
              <p>
                {invitationStates[invitation.state]} ·{" "}
                {deliveryStates[invitation.delivery]} ·{" "}
                {invitation.organization_name}
              </p>
              <p className="text-sm">
                Vigencia hasta{" "}
                <time dateTime={invitation.expires_at}>
                  {invitation.expires_at.slice(0, 16).replace("T", " ")} UTC
                </time>
              </p>
              {["pending", "expired"].includes(invitation.state) && (
                <div className="flex flex-wrap gap-3">
                  <ActionForm action={resend} label="Reenviar">
                    <input
                      type="hidden"
                      name="invitation"
                      value={invitation.id}
                    />
                  </ActionForm>
                  <ActionForm action={revokeInvitation} label="Revocar">
                    <input
                      type="hidden"
                      name="invitation"
                      value={invitation.id}
                    />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </Portal>
  );
}
