/**
 * The copy the screen needs only on demand stays out of the up-front bundle.
 *
 * Failure modes, each with the test that catches it:
 *  1. A module the list or the card loads imports the guide, How this works or the glossary, so the page ships
 *     them again and `/screening` grows by about 7 KiB gzip without any test failing. The import graph is read,
 *     whether the import names the module by a relative path or by the `@/` alias, and for the screen's own code
 *     as well as the copy's.
 *  2. The on-demand copy is built twice, or from other counts than the list's. One bound copy gives one promise.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { copyFor } from "@/lib/screening/copy";

const WEB = path.resolve(__dirname, "../../..");
const COPY = path.join(WEB, "lib/screening/copy");
const ON_DEMAND = ["explainer", "glossary", "guide", "later", "method"];

/** Every .ts and .tsx file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** The modules a file imports as the page ships them: not type-only imports, which leave no code behind. */
function staticImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const named = [...text.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gm)].map(
    (m) => m[1]
  );
  const bare = [...text.matchAll(/^import\s+"([^"]+)";/gm)].map((m) => m[1]);
  return [...named, ...bare];
}
const dynamicImports = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);

/** The on-demand module a specifier names, by the file it resolves to, or null for any other module. */
function onDemand(from: string, specifier: string): string | null {
  let resolved: string;
  if (specifier.startsWith("@/")) resolved = path.join(WEB, specifier.slice(2));
  else if (specifier.startsWith(".")) resolved = path.resolve(path.dirname(from), specifier);
  else return null;
  const name = path.basename(resolved);
  return path.dirname(resolved) === COPY && ON_DEMAND.includes(name) ? name : null;
}

describe("what loads up front", () => {
  const screen = [
    ...sources(path.join(WEB, "lib")),
    ...sources(path.join(WEB, "components")),
    ...sources(path.join(WEB, "app")),
  ].filter((f) => !ON_DEMAND.some((n) => f === path.join(COPY, `${n}.ts`)));

  it("imports none of the on-demand modules statically, by any path", () => {
    expect(screen.length).toBeGreaterThan(50);
    for (const file of screen)
      expect(
        staticImports(file).filter((s) => onDemand(file, s) !== null),
        path.relative(WEB, file)
      ).toEqual([]);
  });

  it("notices an import by the alias, and one that is only a type", () => {
    const probe = path.join(COPY, "ideas.ts");
    expect(onDemand(probe, "@/lib/screening/copy/guide")).toBe("guide");
    expect(onDemand(probe, "./guide")).toBe("guide");
    expect(onDemand(probe, "../copy/glossary")).toBe("glossary");
    expect(onDemand(probe, "./format")).toBeNull();
    expect(onDemand(probe, "react")).toBeNull();
  });

  it("reaches the on-demand modules only through one dynamic import each, in the bound copy", () => {
    const found = screen.flatMap((file) =>
      dynamicImports(file)
        .filter((s) => onDemand(file, s) !== null)
        .map((s) => `${path.relative(WEB, file)} -> ${s}`)
    );
    expect(found.sort()).toEqual([
      "lib/screening/copy/bound.ts -> ./later",
      "lib/screening/copy/bound.ts -> ./method",
    ]);
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
