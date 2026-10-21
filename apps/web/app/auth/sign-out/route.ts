import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

function isCrossSite(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  // Current browsers send Origin on same-origin form posts, so a missing Origin is allowed.
  if (origin === null) return false;
  // Compare with the address the browser used, since Next can name the server by another host such as localhost.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // "null" from an opaque origin, or any value that is not an origin
  }
}

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return new NextResponse(null, { status: 403 });
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.url), 303);
}
