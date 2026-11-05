/**
 * The names of the ways into the explore page, beside the guides' own controls. Failure mode, with the test that
 * catches it:
 *  1. A way to the charts reads as the guides' dismiss: "Explore all schools" sat in Help a few lines from "Explore on
 *     my own", and a first-time reader could take one for the other
 *                                     -> "no way to the charts starts with the word the guides' dismiss starts with"
 */
import { describe, expect, it } from "vitest";

import { EXPLORE } from "@/lib/screening/copy/explore";
import { GUIDE } from "@/lib/screening/copy/guide";
import { LAYOUT } from "@/lib/screening/copy/words";

const firstWord = (text: string) => text.split(/\s/)[0].toLowerCase();

describe("the ways into the explore page", () => {
  it("no way to the charts starts with the word the guides' dismiss starts with", () => {
    for (const name of [LAYOUT.explore, LAYOUT.seeAmongAll, EXPLORE.title])
      expect(firstWord(name), name).not.toBe(firstWord(GUIDE.explore));
  });
});
