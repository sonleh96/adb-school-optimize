/**
 * The copy the screen needs only on demand stays out of the up-front bundle.
 *
 * Failure modes, each with the test that catches it:
 *  1. A module the list or the card loads imports the guide, How this works or the glossary, so the page ships
 *     them again and `/screening` grows by about 7 KiB gzip without any test failing. The import graph is read.
 *  2. The on-demand copy is built twice, or from other counts than the list's. One bound copy gives one promise.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { copyFor } from "@/lib/screening/copy";

const DIR = path.resolve(__dirname, "../../../lib/screening/copy");
const ON_DEMAND = ["explainer", "glossary", "guide", "later"];

const importsOf = (file: string) =>
  [
    ...readFileSync(path.join(DIR, file), "utf8").matchAll(
      /^(?:import|export)\s+(?!type\b)[^;]*?from\s+"\.\/([\w-]+)";/gm
    ),
  ].map((m) => m[1]);

describe("what loads up front", () => {
  const upFront = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !ON_DEMAND.includes(f.slice(0, -3)));

  it("imports none of the on-demand modules statically", () => {
    expect(upFront.length).toBeGreaterThan(15);
    for (const file of upFront)
      expect(
        importsOf(file).filter((m) => ON_DEMAND.includes(m)),
        file
      ).toEqual([]);
  });

  it("reaches the on-demand module only through a dynamic import", () => {
    const bound = readFileSync(path.join(DIR, "bound.ts"), "utf8");
    expect(bound).toMatch(/import\("\.\/later"\)/);
  });
});

describe("the on-demand copy of one bound copy", () => {
  it("is built once and carries the counts the list was bound to", async () => {
    const P = copyFor({ counts: { complete: 61, range: 2, ranked: 63 } });
    const first = P.later();
    expect(P.later()).toBe(first);
    const { HOW_IT_WORKS } = await first;
    expect(HOW_IT_WORKS.flatMap((s) => s.sentences).join(" ")).toContain("61");
  });
});
