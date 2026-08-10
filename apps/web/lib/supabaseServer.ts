import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getAuthConfig } from "@/lib/auth";

export async function createSupabaseServerClient() {
  const config = getAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components cannot write cookies. Middleware refreshes sessions.
        }
      },
    },
  });
}
