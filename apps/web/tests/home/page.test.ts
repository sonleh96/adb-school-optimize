/**
 * The homepage's source.
 *
 * Failure mode: a sentence on the page is written in the page's source or in one of its drawings, outside the copy
 * system, so it escapes the writing guards that tests/home/copy.test.ts runs   -> "the page writes no word..."
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { literalsIn } from "../screening/copy/helpers";

const COMPONENTS = path.resolve(__dirname, "../../components/home");

describe("the homepage", () => {
  it("the page writes no word of its own, and nor do its drawings", () => {
    const files = [
      path.resolve(__dirname, "../../app/page.tsx"),
      ...readdirSync(COMPONENTS)
        .filter((file) => file.endsWith(".tsx"))
        .map((file) => path.join(COMPONENTS, file)),
    ];
    expect(files.length).toBeGreaterThan(1);
    for (const file of files) expect(literalsIn(readFileSync(file, "utf8")), file).toEqual([]);
  });
});
