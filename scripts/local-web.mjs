import { spawnSync } from "node:child_process";
import { localSupabase } from "./local-supabase.mjs";

try {
  const { ANON_KEY, SERVICE_ROLE_KEY } = localSupabase();
  const result = spawnSync(
    "pnpm",
    ["--filter", "@legacy-gym/web", "dev", "--hostname", "127.0.0.1"],
    {
      env: {
        ...process.env,
        APP_ORIGIN: "http://127.0.0.1:3000",
        SUPABASE_ANON_KEY: ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      },
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    "No se pudo obtener la configuración de Supabase local. Ejecuta pnpm db:start.",
  );
  process.exitCode = 1;
}
