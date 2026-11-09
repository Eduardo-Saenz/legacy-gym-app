import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  publicKey,
  sessionOptions,
  supabaseUrl,
  uncachedFetch,
} from "./settings";

export async function sessionClient(writeCookies = false) {
  const jar = await cookies();
  return createServerClient(supabaseUrl, publicKey(), {
    cookieOptions: sessionOptions,
    global: { fetch: uncachedFetch },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (updates) => {
        if (writeCookies) {
          for (const { name, value, options } of updates)
            jar.set(name, value, options);
        }
      },
    },
  });
}

export async function verifiedSession(writeCookies = false) {
  const db = await sessionClient(writeCookies);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/entrar?sesion=1");
  return { db, actor: data.user.id };
}

export async function bearerClient(token: string) {
  const db = createClient(supabaseUrl, publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: "Bearer " + token },
      fetch: uncachedFetch,
    },
  });
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : { db, actor: data.user.id };
}
