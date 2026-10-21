/**
 * `POST /auth/sign-out` ends the analyst's session. Failure modes and the test for each:
 *  1. A page on another site posts here and signs the analyst out (a forced logout)
 *     -> "refuses a post from another origin and keeps the session", "refuses a cross-site post with no Origin"
 *  2. The app's own sign-out form is refused, so the analyst cannot sign out
 *     -> "signs out on a same-origin post"
 *  3. A post without an Origin header is refused, which would break a client that omits the header
 *     -> "signs out when no Origin header is sent"
 *  4. The server names itself differently from the address the browser used (`next start` reads `localhost` while the
 *     browser sent `127.0.0.1`), so the app's own sign-out is refused
 *     -> "signs out when the server reads its own address under another host name"
 * The route runs the real Supabase client. The fakes are Next's cookie store and the network, so a sign-out shows as
 * the logout request the client sends to Supabase, and the session cookie is what the browser would keep or lose.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/auth/sign-out/route";

const APP = "https://app.test";
const SUPABASE = "https://abc123.supabase.test";
const SESSION_COOKIE = "sb-abc123-auth-token";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (value === "" || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

const session = {
  access_token: "access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "refresh-token",
  user: {
    id: "user-1",
    aud: "authenticated",
    email: "analyst@example.org",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};
const sessionCookie = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

// Browsers always send Host, the address the request was made to; the default matches the URL the route is given.
const post = (headers: Record<string, string> = {}, url = `${APP}/auth/sign-out`) =>
  POST(new NextRequest(url, { method: "POST", headers: { Host: "app.test", ...headers } }));

describe("POST /auth/sign-out", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const logouts = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/v1/logout"));

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", SUPABASE);
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    jar.clear();
    jar.set(SESSION_COOKIE, sessionCookie);
    // `fetch` is the browser's and the network's, not ours; the route and the client under test are the real ones.
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signs out on a same-origin post and sends the analyst to sign-in", async () => {
    const response = await post({ Origin: APP, "Sec-Fetch-Site": "same-origin" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP}/sign-in`);
    expect(logouts()).toHaveLength(1);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it.each([
    ["another site", "https://evil.example"],
    ["an opaque origin, which a sandboxed page sends as null", "null"],
  ])("refuses a post from %s with 403 and keeps the session", async (_name, origin) => {
    const response = await post({ Origin: origin });

    expect(response.status).toBe(403);
    expect(logouts()).toHaveLength(0);
    expect(jar.get(SESSION_COOKIE)).toBe(sessionCookie);
  });

  it("refuses a cross-site post with no Origin header with 403 and keeps the session", async () => {
    const response = await post({ "Sec-Fetch-Site": "cross-site" });

    expect(response.status).toBe(403);
    expect(logouts()).toHaveLength(0);
    expect(jar.get(SESSION_COOKIE)).toBe(sessionCookie);
  });

  it("signs out when the server reads its own address under another host name", async () => {
    const response = await post(
      { Host: "127.0.0.1:3981", Origin: "http://127.0.0.1:3981", "Sec-Fetch-Site": "same-origin" },
      "http://localhost:3981/auth/sign-out"
    );

    expect(response.status).toBe(303);
    expect(logouts()).toHaveLength(1);
  });

  it("signs out when no Origin header is sent", async () => {
    const response = await post({});

    expect(response.status).toBe(303);
    expect(logouts()).toHaveLength(1);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});
