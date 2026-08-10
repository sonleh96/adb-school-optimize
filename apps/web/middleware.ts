import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthConfig, isAllowedEmail, safeNextPath, shouldEnforceAuth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/sign-in", "/auth/callback", "/healthz"]);

export async function middleware(request: NextRequest) {
  if (!shouldEnforceAuth() || PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const config = getAuthConfig();
  if (!config) return signInRedirect(request, "configuration");

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const cookie of cookiesToSet) request.cookies.set(cookie.name, cookie.value);
        response = NextResponse.next({ request });
        for (const cookie of cookiesToSet) response.cookies.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAllowedEmail(user.email)) return response;
  return signInRedirect(request, user ? "allowlist" : null);
}

function signInRedirect(request: NextRequest, error: string | null) {
  const url = request.nextUrl.clone();
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("next", next);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
