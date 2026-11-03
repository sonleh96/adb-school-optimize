/**
 * The homepage's source.
 *
 * Failure mode: a sentence on the page is written in the page's source, outside the copy system, so it escapes the
 * writing guards that tests/home/copy.test.ts runs              -> "the page writes no word..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { literalsIn } from "../screening/copy/helpers";

describe("the homepage", () => {
  it("the page writes no word of its own", () => {
    const source = readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");
    expect(literalsIn(source)).toEqual([]);
  });
});
