import { isoDate, uuid } from "../access/input";

export function decimal(value: unknown) {
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value))
    return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && /^\d+(\.\d{1,2})?$/.test(String(amount))
    ? amount
    : null;
}

export function newMeasurement(
  kind: unknown,
  unit: unknown,
  value: unknown,
  date: unknown,
) {
  const amount = decimal(value);
  if (amount === null || !isoDate(date)) return null;
  if (kind === "weight" && unit === "kg" && amount >= 10 && amount <= 500) {
    return { kind_value: kind, unit_value: unit, amount, measured: date };
  }
  if (kind === "height" && unit === "cm" && amount >= 40 && amount <= 280) {
    return { kind_value: kind, unit_value: unit, amount, measured: date };
  }
  return null;
}

export function correction(
  id: unknown,
  version: unknown,
  value: unknown,
  reason: unknown,
) {
  if (
    !uuid(id) ||
    (typeof version !== "number" && typeof version !== "string") ||
    !/^\d+$/.test(String(version)) ||
    typeof reason !== "string"
  )
    return null;
  const expected_version = Number(version);
  const amount = decimal(value);
  const explanation = reason.trim();
  if (
    expected_version >= 2_147_483_647 ||
    amount === null ||
    amount < 10 ||
    amount > 500 ||
    !explanation ||
    explanation.length > 300
  )
    return null;
  return { measurement: id, expected_version, amount, explanation };
}
