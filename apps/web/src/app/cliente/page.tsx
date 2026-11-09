import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import {
  MeasurementHistory,
  ProfilePanel,
  RecordMeasurementPanel,
} from "@/components/client-record";
import { Panel, Portal } from "@/components/portal";
import { changeConsent } from "@/modules/clients/actions";
import {
  clientConsents,
  clientDetails,
  ownClient,
  scopes,
  type Scope,
} from "@/modules/clients/records";
import { measurements } from "@/modules/measurements/records";
import { verifiedSession } from "@/server/session";

export default async function ClientPage() {
  const { db, actor } = await verifiedSession();
  const client = await ownClient(db, actor);
  if (!client) redirect("/cuenta");

  const [details, history, consents] = await Promise.all([
    clientDetails(db, client.id),
    measurements(db, client.id),
    clientConsents(db, client.id),
  ]);
  const active = consents[0];
  return (
    <Portal title="Portal del cliente" back="/cliente">
      <ProfilePanel target={client.id} details={details} editable />
      <Panel title="Autorizaciones para mi coach">
        {active ? (
          <>
            <p className="break-words">
              Coach {active.coach_id} · {active.organization_name}
            </p>
            <p>
              El historial incluye las mediciones y revisiones anteriores.
              Puedes retirar cada permiso en cualquier momento.
            </p>
            <ul className="grid gap-4">
              {(Object.keys(scopes) as Scope[]).map((scope) => {
                const grant = consents.find((entry) => entry.scope === scope);
                return (
                  <li
                    key={scope}
                    className="rounded border border-slate-700 p-3"
                  >
                    <h3 className="mb-2 font-semibold">{scopes[scope]}</h3>
                    {grant?.granted_at && (
                      <p className="mb-2 text-sm">
                        Concedido el{" "}
                        <time>{grant.granted_at.slice(0, 10)}</time>
                      </p>
                    )}
                    <ActionForm
                      action={changeConsent}
                      label={
                        grant ? "Revocar autorización" : "Conceder autorización"
                      }
                    >
                      <input type="hidden" name="client" value={client.id} />
                      <input
                        type="hidden"
                        name="relationship"
                        value={active.relationship_id}
                      />
                      <input type="hidden" name="scope" value={scope} />
                      <input
                        type="hidden"
                        name="decision"
                        value={grant ? "revoke" : "allow"}
                      />
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p>En este momento no tienes un coach activo.</p>
        )}
      </Panel>
      <RecordMeasurementPanel target={client.id} />
      <MeasurementHistory target={client.id} entries={history} correctable />
    </Portal>
  );
}
