import { NextResponse, type NextRequest } from "next/server";

import { shouldEnforceAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const ALLOWED_ASSET_PATH =
  /^(?:exports\/(?:ranked\.(?:csv|xlsx)|scores\.xlsx|full\.xlsx)|rasters\/(?:flood|landcover|luminosity|elevation)\/overlay)$/;
const FORWARDED_HEADERS = ["cache-control", "content-disposition", "content-length", "content-type", "etag"];

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const upstreamPath = path.join("/");
  if (!ALLOWED_ASSET_PATH.test(upstreamPath)) {
    return NextResponse.json({ error: "Asset route not allowed." }, { status: 404 });
  }

  const apiOrigin = (process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(
    /\/$/,
    ""
  );
  if (!apiOrigin) return NextResponse.json({ error: "API proxy is not configured." }, { status: 503 });

  let accessToken: string | null = null;
  if (shouldEnforceAuth()) {
    const supabase = await createSupabaseServerClient();
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    accessToken = session?.access_token ?? null;
    if (!accessToken) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const upstreamUrl = new URL(`/api/v1/${upstreamPath}`, apiOrigin);
  upstreamUrl.search = request.nextUrl.search;
  const upstream = await fetch(upstreamUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    cache: "no-store",
    redirect: "error",
  });
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Content-Type-Options", "nosniff");
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
