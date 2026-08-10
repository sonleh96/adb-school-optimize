import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("keeps browser API requests on the preview origin and forwards them to Cloud Run", () => {
    const config = JSON.parse(readFileSync(resolve(import.meta.dirname, "../vercel.json"), "utf8")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const apiRewrite = config.rewrites?.find((rewrite) => rewrite.source === "/api/v1/:path*");

    expect(apiRewrite?.destination).toBe(
      "https://rise-png-api-73728254844.asia-southeast1.run.app/api/v1/:path*"
    );
  });
});
