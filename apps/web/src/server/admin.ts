import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, uncachedFetch } from "./settings";

export function invitationAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta la clave administrativa de Supabase local");
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: uncachedFetch },
  });
}
