import { notFound } from "next/navigation";
import {
  MeasurementHistory,
  ProfilePanel,
  RecordMeasurementPanel,
} from "@/components/client-record";
import { Panel, Portal } from "@/components/portal";
import { uuid } from "@/modules/access/input";
import { activeClients, clientDetails } from "@/modules/clients/records";
import { measurements } from "@/modules/measurements/records";
import { verifiedSession } from "@/server/session";

export default async function CoachClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db } = await verifiedSession();
  const { id } = await params;
  if (!uuid(id)) notFound();
  const client = (await activeClients(db)).find(
    (entry) => entry.client_id === id,
  );
  if (!client) notFound();
  const profile = client.scopes.includes("client_record_read");
  const editProfile = client.scopes.includes("client_profile_write");
  const history = client.scopes.includes("measurement_read");
  const [details, entries] = await Promise.all([
    profile ? clientDetails(db, id) : null,
    history ? measurements(db, id) : [],
  ]);

  return (
    <Portal title={client.full_name ?? "Cliente activo"} back="/coach">
      {!client.scopes.length && (
        <Panel title="Acceso pendiente">
          <p>El cliente debe conceder los permisos que quiera compartir.</p>
        </Panel>
      )}
      {editProfile && !profile && (
        <p>
          Puedes sustituir el nombre y la fecha de nacimiento, pero no consultar
          sus valores actuales. Dejar la fecha vacía elimina la fecha guardada.
        </p>
      )}
      {(profile || editProfile) && (
        <ProfilePanel target={id} details={details} editable={editProfile} />
      )}
      {client.scopes.includes("measurement_write") && (
        <RecordMeasurementPanel target={id} />
      )}
      {history && (
        <MeasurementHistory
          target={id}
          entries={entries}
          correctable={client.scopes.includes("measurement_correct")}
        />
      )}
    </Portal>
  );
}
