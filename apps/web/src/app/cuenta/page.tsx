import { redirect } from "next/navigation";
import { Portal, Panel } from "@/components/portal";
import { verifiedSession } from "@/server/session";
import { coachMemberships, ownClient } from "@/modules/clients/records";

export default async function AccountPage() {
  const { db, actor } = await verifiedSession();
  const [memberships, client] = await Promise.all([
    coachMemberships(db, actor),
    ownClient(db, actor),
  ]);
  if (memberships.length) redirect("/coach");
  if (client) redirect("/cliente");
  return (
    <Portal title="Cuenta pendiente" back="/cuenta">
      <Panel title="Acceso pendiente">
        <p>
          Tu identidad aún no tiene acceso a Legacy Gym. Contacta a tu coach.
        </p>
      </Panel>
    </Portal>
  );
}
