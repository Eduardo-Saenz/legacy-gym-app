import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  publicKey,
  sessionOptions,
  supabaseUrl,
  uncachedFetch,
} from "@/server/settings";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) {
    const db = createServerClient(supabaseUrl, publicKey(), {
      cookieOptions: sessionOptions,
      global: { fetch: uncachedFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (updates) => {
          for (const { name, value } of updates)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of updates)
            response.cookies.set(name, value, options);
        },
      },
    });
    await db.auth.getUser();
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: [
    "/cuenta",
    "/cliente/:path*",
    "/coach/:path*",
    "/entrar",
    "/activar",
    "/recuperar/:path*",
  ],
};
