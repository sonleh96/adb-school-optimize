/**
 * Failure modes of the download proxy, which adds the signed-in user's token to a same-origin link:
 * a route the API no longer has (the removed Need/Priority exports and raster overlays) is still forwarded,
 * a path that only starts like an export reaches the API, and a screening export is refused.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/proxy/[...path]/route";

const call = (path: string, query = "") =>
  GET(new NextRequest(`http://app.test/api/proxy/${path}${query}`), {
    params: Promise.resolve({ path: path.split("/") }),
  });

describe("the download proxy", () => {
  let upstream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("API_PROXY_TARGET", "http://api.test/");
    vi.stubEnv("AUTH_REQUIRED", "false");
    // `fetch` is the network, not our code; the route under test is the real one.
    upstream = vi.fn(async () => new Response("a,b\n", { headers: { "content-type": "text/csv" } }));
    vi.stubGlobal("fetch", upstream);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["screening/exports/top.csv", "screening/exports/top.xlsx", "screening/exports/incomplete.csv"])(
    "forwards %s with its query to the API",
    async (path) => {
      const response = await call(path, "?rule=additive_u&k=10");

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("a,b\n");
      expect(String(upstream.mock.calls[0][0])).toBe(`http://api.test/api/v1/${path}?rule=additive_u&k=10`);
    }
  );

  it.each([
    "exports/ranked.csv",
    "rasters/flood/overlay",
    "screening/results",
    "screening/exports/top.csv/extra",
    "screening/exports/top.json",
    "../healthz",
  ])("answers 404 for %s without calling the API", async (path) => {
    const response = await call(path);

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
