import { NextResponse } from "next/server";

import { isAllowedEmail, shouldEnforceAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  if (!shouldEnforceAuth()) return NextResponse.json({ required: false, email: null });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ required: true, email: null }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ required: true, email: isAllowedEmail(user?.email) ? user?.email : null });
}
