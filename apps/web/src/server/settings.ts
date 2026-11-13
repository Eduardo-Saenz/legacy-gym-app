export function localOrigin() {
  const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
  if (!/^http:\/\/127\.0\.0\.1:(3000|3100)$/.test(origin)) {
    throw new Error("APP_ORIGIN debe apuntar a la web local");
  }
  return origin;
}

export const supabaseUrl = "http://127.0.0.1:54321";
export const mailpitUrl = "http://127.0.0.1:54324";

export function publicKey() {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Falta SUPABASE_ANON_KEY de Supabase local");
  return key;
}

export const sessionOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

export const uncachedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
