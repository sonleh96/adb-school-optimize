/**
 * The card numbers a school's reasons largest first. Two reasons can add exactly the same, and then a fixed order
 * of the inputs decides which gets the smaller number. Failure modes, each with the test that catches it:
 *  1. Equal reasons get different numbers and nothing says they are equal, so a reader takes 1 as the larger.
 *  2. Reasons that differ only a little are called equal.
 *  3. More than two equal reasons, or two separate pairs, are worded as if they were one pair.
 */
import { describe, expect, it } from "vitest";

import { equalReasons } from "@/lib/screening/copy";

import { textProblems } from "./helpers";

const drivers = (...values: number[]) => values.map((value) => ({ value }));

describe("reasons that add exactly the same", () => {
  it("are named by their numbers on the card, with a sentence that says neither comes first", () => {
    const text = equalReasons(drivers(0.3, 0.3, 0.2));
    expect(text).toBe("Reasons 1 and 2 add exactly the same, so neither comes before the other.");
    expect(textProblems(text)).toEqual([]);
    expect(equalReasons(drivers(0.4, 0.2, 0.2))).toBe(
      "Reasons 2 and 3 add exactly the same, so neither comes before the other."
    );
  });

  it("are not said to be equal when they differ, however little", () => {
    expect(equalReasons(drivers(0.3, 0.2999, 0.2))).toBeNull();
    expect(equalReasons(drivers(0.3))).toBeNull();
    expect(equalReasons([])).toBeNull();
  });

  it("are counted as a group of three, or as two separate pairs", () => {
    expect(equalReasons(drivers(0.2, 0.2, 0.2))).toBe(
      "Reasons 1, 2 and 3 add exactly the same, so none comes before another."
    );
    const pairs = equalReasons(drivers(0.4, 0.4, 0.2, 0.2));
    expect(pairs).toBe(
      "Reasons 1 and 2 add exactly the same, and so do reasons 3 and 4, so neither of a pair comes before the other."
    );
    expect(textProblems(pairs)).toEqual([]);
  });
});
