import { NextResponse } from "next/server";

import { isAllowedEmail, shouldEnforceAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  if (!shouldEnforceAuth()) return NextResponse.json({ required: false, accessToken: null });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ required: true, accessToken: null }, { status: 503 });
  const [userResult, sessionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const user = userResult.data.user;
  const session = sessionResult.data.session;
  if (!user || !isAllowedEmail(user.email) || !session) {
    return NextResponse.json({ required: true, accessToken: null }, { status: 401 });
  }
  return NextResponse.json(
    { required: true, accessToken: session.access_token, expiresAt: session.expires_at },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
