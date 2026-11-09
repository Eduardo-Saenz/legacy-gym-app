import { ActionForm } from "./action-form";
import { Panel } from "./portal";
import { saveProfile } from "@/modules/clients/actions";
import type { ClientDetails } from "@/modules/clients/records";
import { register, revise } from "@/modules/measurements/actions";
import type { Measurement } from "@/modules/measurements/records";

export function ProfilePanel({
  target,
  details,
  editable,
}: {
  target: string;
  details: ClientDetails | null;
  editable: boolean;
}) {
  return (
    <Panel title="Ficha personal">
      {editable ? (
        <ActionForm action={saveProfile} label="Guardar ficha">
          <input type="hidden" name="client" value={target} />
          <label>
            Nombre{" "}
            <input
              name="name"
              defaultValue={details?.full_name}
              maxLength={120}
              required
            />
          </label>
          <label>
            Fecha de nacimiento (opcional)
            <input
              name="birthDate"
              type="date"
              min="1900-01-01"
              defaultValue={details?.birth_date ?? ""}
            />
          </label>
        </ActionForm>
      ) : details ? (
        <dl className="grid gap-2">
          <dt>Nombre</dt>
          <dd className="font-semibold">{details.full_name}</dd>
          <dt>Fecha de nacimiento</dt>
          <dd>{details.birth_date ?? "Sin registrar"}</dd>
        </dl>
      ) : (
        <p>El cliente todavía no ha completado su ficha.</p>
      )}
    </Panel>
  );
}

export function RecordMeasurementPanel({ target }: { target: string }) {
  return (
    <Panel title="Registrar medición">
      <ActionForm action={register} label="Guardar medición">
        <input type="hidden" name="client" value={target} />
        <label>
          Tipo de medición{" "}
          <select name="kind">
            <option value="weight:kg">Peso (kg)</option>
            <option value="height:cm">Estatura (cm)</option>
          </select>
        </label>
        <label>
          Valor{" "}
          <input
            name="value"
            type="number"
            min="10"
            max="500"
            step="0.01"
            required
          />
        </label>
        <label>
          Fecha de medición
          <input
            name="measuredOn"
            type="date"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>
      </ActionForm>
    </Panel>
  );
}

export function MeasurementHistory({
  target,
  entries,
  correctable,
}: {
  target: string;
  entries: Measurement[];
  correctable: boolean;
}) {
  return (
    <Panel title="Historial de mediciones">
      {!entries.length && <p>Todavía no hay mediciones.</p>}
      <ul className="grid gap-5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="grid gap-2 border-b border-slate-700 pb-4"
          >
            <h3 className="font-semibold">
              {entry.kind === "weight" ? "Peso" : "Estatura"} ·{" "}
              {entry.currentValue} {entry.unit}
            </h3>
            <p>
              Medición del <time>{entry.measuredOn}</time> · Valor original{" "}
              {entry.originalValue} {entry.unit}
            </p>
            <p className="text-sm text-slate-300">
              Registro del{" "}
              <time dateTime={entry.recordedAt}>
                {entry.recordedAt.slice(0, 10)}
              </time>
            </p>
            {entry.revisions.length > 0 && (
              <details>
                <summary>Revisiones ({entry.revisions.length})</summary>
                <ol className="mt-2 list-decimal space-y-2 pl-5">
                  {entry.revisions.map((r) => (
                    <li key={r.version} className="break-words">
                      {r.previousValue} → {r.newValue} {entry.unit} · {r.reason}
                      <div className="text-sm text-slate-300">
                        <time dateTime={r.correctedAt}>
                          {r.correctedAt.slice(0, 10)}
                        </time>{" "}
                        · Autor {r.correctedBy}
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {correctable && (
              <details>
                <summary>Corregir medición</summary>
                <ActionForm
                  action={revise}
                  label="Guardar corrección"
                  className="mt-3 grid gap-3"
                >
                  <input type="hidden" name="client" value={target} />
                  <input type="hidden" name="measurement" value={entry.id} />
                  <input type="hidden" name="version" value={entry.version} />
                  <label>
                    Valor corregido ({entry.unit})
                    <input
                      name="value"
                      type="number"
                      min={entry.kind === "weight" ? 10 : 40}
                      max={entry.kind === "weight" ? 500 : 280}
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Motivo <textarea name="reason" maxLength={300} required />
                  </label>
                </ActionForm>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
