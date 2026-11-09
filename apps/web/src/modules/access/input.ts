export function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function emailAddress(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

export function validPassword(value: string) {
  const bytes = new TextEncoder().encode(value).length;
  return value.length >= 12 && bytes <= 72;
}

export function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}

export function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime())) return false;
  const today = new Date().toISOString().slice(0, 10);
  return (
    parsed.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= today
  );
}

export type ActionState = { error?: string; message?: string };
