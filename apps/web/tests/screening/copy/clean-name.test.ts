/**
 * A school name as the screen shows it. The source records arrive title-cased, which raises the letter after an
 * apostrophe ("Saint Kareba'S"). Failure modes, each with the test that catches it (the names are invented):
 *  1. The lone letter after an apostrophe stays raised                -> "lowers the letter..."
 *  2. A name part that starts after an apostrophe (O'Kane) is lowered  -> "keeps a name part..."
 *  3. The typographic apostrophe is missed                            -> "lowers the letter..."
 *  4. The spaces the name is shown with change                        -> "still trims..."
 */
import { describe, expect, it } from "vitest";

import { cleanName, displayName } from "@/lib/screening/copy";

describe("a school name shown on screen", () => {
  it("lowers the letter after an apostrophe that ends a word, with either apostrophe", () => {
    expect(cleanName("Saint Kareba'S Secondary School")).toBe("Saint Kareba's Secondary School");
    expect(cleanName("St. Tamu’S - Wari Day School")).toBe("St. Tamu’s - Wari Day School");
    expect(displayName({ name: "Mount Lavu'S" })).toBe("Mount Lavu's");
  });

  it("keeps a name part that starts after an apostrophe", () => {
    expect(cleanName("O'Kane Memorial School")).toBe("O'Kane Memorial School");
    expect(cleanName("D’Arcy Kila High School")).toBe("D’Arcy Kila High School");
  });

  it("still trims and joins its spaces", () => {
    expect(cleanName("  Kareba'S   Junior  High ")).toBe("Kareba's Junior High");
  });
});
