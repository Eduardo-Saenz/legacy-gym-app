import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { correction, newMeasurement } from "./input";

export type Revision = {
  version: number;
  previousValue: number;
  newValue: number;
  reason: string;
  correctedBy: string;
  correctedAt: string;
};

export type Measurement = {
  id: string;
  kind: "weight" | "height";
  unit: "kg" | "cm";
  originalValue: number;
  measuredOn: string;
  recordedAt: string;
  recordedBy: string;
  currentValue: number;
  version: number;
  revisions: Revision[];
};

type MeasurementRow = {
  id: string;
  kind: Measurement["kind"];
  unit: Measurement["unit"];
  original_value: number;
  measured_on: string;
  recorded_at: string;
  recorded_by: string;
  measurement_revisions: {
    version: number;
    previous_value: number;
    new_value: number;
    reason: string;
    corrected_by: string;
    corrected_at: string;
  }[];
};

export async function measurements(
  db: SupabaseClient,
  target: string,
): Promise<Measurement[]> {
  const { data, error } = await db
    .schema("gym_api")
    .from("measurements")
    .select(
      "id,kind,unit,original_value,measured_on,recorded_at,recorded_by,measurement_revisions(version,previous_value,new_value,reason,corrected_by,corrected_at)",
    )
    .eq("client_id", target)
    .order("measured_on", { ascending: false })
    .order("id")
    .order("version", { referencedTable: "measurement_revisions" })
    .returns<MeasurementRow[]>();
  if (error) throw new Error("No se pudieron consultar las mediciones");
  return data.map((entry) => {
    const revisions = entry.measurement_revisions.map((r) => ({
      version: r.version,
      previousValue: r.previous_value,
      newValue: r.new_value,
      reason: r.reason,
      correctedBy: r.corrected_by,
      correctedAt: r.corrected_at,
    }));
    const latest = revisions.at(-1);
    return {
      id: entry.id,
      kind: entry.kind,
      unit: entry.unit,
      originalValue: entry.original_value,
      measuredOn: entry.measured_on,
      recordedAt: entry.recorded_at,
      recordedBy: entry.recorded_by,
      currentValue: latest?.newValue ?? entry.original_value,
      version: latest?.version ?? 0,
      revisions,
    };
  });
}

export function recordMeasurement(
  db: SupabaseClient,
  target: string,
  input: NonNullable<ReturnType<typeof newMeasurement>>,
) {
  return db.schema("gym_api").rpc("record_measurement", { target, ...input });
}

export function correctMeasurement(
  db: SupabaseClient,
  target: string,
  input: NonNullable<ReturnType<typeof correction>>,
) {
  return db.schema("gym_api").rpc("correct_measurement", { target, ...input });
}
