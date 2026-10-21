/**
 * Failure modes of the hardening:
 *  1. A browser-test seam reaches a production bundle because a build variable was left set.
 *  2. The API client sends the user's bearer token to a path that is not the API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";

// @ts-expect-error The module is plain JavaScript, shared with next.config.mjs.
import { assertNoTestSeams } from "../../scripts/test-seams.mjs";

describe("assertNoTestSeams", () => {
  it("stops a production build that carries the test hooks", () => {
    expect(() =>
      assertNoTestSeams({ VERCEL_ENV: "production", NEXT_PUBLIC_SCREENING_TEST_HOOKS: "true" })
    ).toThrow("NEXT_PUBLIC_SCREENING_TEST_HOOKS must not be set for a production build");
  });

  it("stops a production build that replaces the basemap", () => {
    expect(() =>
      assertNoTestSeams({ VERCEL_ENV: "production", NEXT_PUBLIC_SCREENING_BASEMAP_STYLE: "/x.json" })
    ).toThrow("NEXT_PUBLIC_SCREENING_BASEMAP_STYLE must not be set");
  });

  it("names both when both are set", () => {
    expect(() =>
      assertNoTestSeams({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SCREENING_TEST_HOOKS: "true",
        NEXT_PUBLIC_SCREENING_BASEMAP_STYLE: "/x.json",
      })
    ).toThrow("NEXT_PUBLIC_SCREENING_TEST_HOOKS and NEXT_PUBLIC_SCREENING_BASEMAP_STYLE");
  });

  it("lets a preview or a local build use them, and a production build without them pass", () => {
    expect(() =>
      assertNoTestSeams({ VERCEL_ENV: "preview", NEXT_PUBLIC_SCREENING_TEST_HOOKS: "true" })
    ).not.toThrow();
    expect(() => assertNoTestSeams({ NEXT_PUBLIC_SCREENING_TEST_HOOKS: "true" })).not.toThrow();
    expect(() => assertNoTestSeams({ VERCEL_ENV: "production" })).not.toThrow();
  });
});

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "/auth/token",
    "/api/proxy/exports/ranked.csv",
    "https://example.com/api/v1/x",
    "//example.com/api/v1/x",
    "/api/v1/../auth/token",
    "api/v1/x",
  ])("refuses %s before any request is made", async (path) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(apiFetch(path)).rejects.toThrow("apiFetch only calls /api/v1/ routes");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls an /api/v1/ route, and a query that contains two dots is not mistaken for a way up the tree", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === "/auth/token") return Response.json({ required: false, accessToken: null });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchSpy);
    await expect(apiFetch("/api/v1/screening/results?province=a..b")).resolves.toEqual({ ok: true });
    expect(fetchSpy.mock.calls.map(([url]) => url)).toContain("/api/v1/screening/results?province=a..b");
  });
});
