import { NextResponse, type NextRequest } from "next/server";

import { isAllowedEmail, safeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (error || !user || !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    const reason = user && !isAllowedEmail(user.email) ? "allowlist" : "callback";
    return NextResponse.redirect(new URL(`/sign-in?error=${reason}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
