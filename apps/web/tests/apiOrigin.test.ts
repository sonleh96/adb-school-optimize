/**
 * Failure modes of the choice of API behind the app's `/api/v1` routes (scripts/api-origin.mjs):
 *  1. A release preview built with API_PROXY_TARGET still reaches production, so the new API revision is never
 *     tried before it takes traffic (the 2026-11-17 release).
 *  2. A Vercel build without the override proxies nowhere, so previews and production show no data.
 *  3. A local or CI build with nothing set reaches production data.
 *  4. vercel.json routes `/api/v1` itself to a fixed origin, which bypasses the choice.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error The module is plain JavaScript, shared with next.config.mjs.
import { apiOrigin, PRODUCTION_API_ORIGIN } from "../scripts/api-origin.mjs";

const TAGGED = "https://rel-20261117---rise-png-api-73728254844.asia-southeast1.run.app";

describe("apiOrigin", () => {
  it("sends a Vercel build to the origin API_PROXY_TARGET names", () => {
    expect(apiOrigin({ VERCEL: "1", API_PROXY_TARGET: `${TAGGED}/` })).toBe(TAGGED);
  });

  it("sends a Vercel build without the override to the production API", () => {
    expect(apiOrigin({ VERCEL: "1" })).toBe(PRODUCTION_API_ORIGIN);
  });

  it("sends any other build nowhere unless it names an API", () => {
    expect(apiOrigin({})).toBe("");
    expect(apiOrigin({ API_PROXY_TARGET: "http://127.0.0.1:8000" })).toBe("http://127.0.0.1:8000");
  });
});

describe("vercel.json", () => {
  it("leaves /api/v1 to next.config.mjs", () => {
    const config = JSON.parse(readFileSync(resolve(import.meta.dirname, "../vercel.json"), "utf8")) as {
      rewrites?: Array<{ source?: string }>;
      routes?: Array<{ src?: string }>;
    };
    const sources = [
      ...(config.rewrites ?? []).map((r) => r.source),
      ...(config.routes ?? []).map((r) => r.src),
    ];
    expect(sources.filter((source) => source?.includes("/api/"))).toEqual([]);
  });
});
