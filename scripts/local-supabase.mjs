import { execFileSync } from "node:child_process";

export function localSupabase() {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }),
  );
  const database = new URL(status.DB_URL);
  if (
    new URL(status.API_URL).origin !== "http://127.0.0.1:54321" ||
    database.host !== "127.0.0.1:54322" ||
    database.pathname !== "/postgres" ||
    database.protocol !== "postgresql:" ||
    !status.ANON_KEY ||
    !status.SERVICE_ROLE_KEY
  ) {
    throw new Error("Se requiere la instancia Supabase local del repositorio.");
  }
  return status;
}
