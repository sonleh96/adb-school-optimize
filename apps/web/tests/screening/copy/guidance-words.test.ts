/**
 * The words of the guidance layer hold in both layouts and in the singular.
 *
 * Failure modes, each with the test that catches it:
 *  1. A guide, help or glossary string places something to the right, left or top right of the screen. In the narrow
 *     layout the card replaces the list region below the map band, so "on the right" points at nothing.
 *  2. A count has no singular form: "1 schools cannot be put in order yet", "the one things that add most", "1 source
 *     files", "1 items can be explained".
 *  3. The guide, How this works and the glossary show an empty busy state while their on-demand copy loads.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { GLOSSARY_GROUPS } from "@/lib/screening/copy/glossary";
import { GUIDE } from "@/lib/screening/copy/guide";
import { HOW_IT_WORKS, FIRST_QUESTIONS } from "@/lib/screening/copy/explainer";
import { HELP, KEYS, LAYOUT } from "@/lib/screening/copy";

import { FN_ARGS } from "./parity-support";
import { textProblems } from "./helpers";

/** Every string a value says: its literals, and what each function says for the parity suite's sample arguments. */
function says(value: unknown, path: string, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    const samples = FN_ARGS[path];
    if (!samples) throw new Error(`${path}: no sample arguments for this function`);
    for (const args of samples) says((value as (...a: unknown[]) => unknown)(...args), path, out);
  } else if (Array.isArray(value)) value.forEach((v, i) => says(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) says(v, `${path}.${k}`, out);
  return out;
}

const POSITION =
  /\bon the (?:right|left)\b|\bto the (?:right|left)\b|\btop (?:right|left)\b|\bbottom (?:right|left)\b|\bat the top of the map\b|\bnext to the (?:list|map)\b/i;

describe("position words in the guidance layer", () => {
  const surfaces: [string, string[]][] = [
    ["GUIDE", says(GUIDE, "GUIDE")],
    ["HELP", says(HELP, "HELP")],
    ["KEYS", says(KEYS, "KEYS")],
    ["LAYOUT", says(LAYOUT, "LAYOUT")],
    ["glossary", GLOSSARY_GROUPS.map((g) => g.heading)],
    ["How this works", HOW_IT_WORKS.flatMap((s) => [s.title, ...s.sentences])],
    ["first questions", FIRST_QUESTIONS.flatMap((q) => [q.question, q.answer])],
    ["terms", Object.values(copy.TERMS).flatMap((t) => [t.label, t.line, t.help])],
  ];

  it.each(surfaces)("%s places nothing to the right or left", (_name, texts) => {
    expect(texts.length).toBeGreaterThan(3);
    expect(texts.filter((t) => POSITION.test(t))).toEqual([]);
  });

  it("names the school card by what it is, not where it is", () => {
    const steps = GUIDE.tasks.flatMap((t) => t.steps);
    const cards = steps.filter((s) => /^The school card\b/.test(s.onScreen));
    expect(cards.map((s) => s.onScreen)).toEqual(["The school card", "The school card", "The school card"]);
    expect(GUIDE.pointToCard(3)).toMatch(/^The school card lists the three things/);
    expect(GUIDE.pointToMissing).toMatch(/^The school card names each missing detail/);
  });
});

describe("counts in the guidance layer have a singular", () => {
  const q4 = GUIDE.tasks[3].steps[0].title as (n: number) => string;

  it("reads one incomplete record as one school", () => {
    expect(q4(1)).toBe("One school is not in the list yet");
    expect(q4(2)).toBe("2 schools are not in the list yet");
    expect(q4(31)).toBe("31 schools are not in the list yet");
  });

  it("reads one reason, one range school, one source file and one explainable item in the singular", () => {
    expect(GUIDE.pointToCard(1)).toBe(
      "The school card lists the one thing that adds most to its score, in the school's own record."
    );
    expect(GUIDE.needNumbered(1, 1)).toBe(
      "The one reason is a part of school need, so the card numbers it inside school need, above the parts that add less."
    );
    expect(GUIDE.needNumbered(1, 3)).toBe(
      "One of the three reasons is a part of school need, so the card numbers it inside school need, above the parts that add less."
    );
    expect(GUIDE.needNumbered(2, 3)).toBe(
      "Two of the three reasons are parts of school need, so the card numbers them inside it, above the parts that add less."
    );
    const tryIt = GUIDE.tasks[2].steps[0].tryIt as (names: string, n: number) => string;
    expect(tryIt("A", 1)).toBe("It is A. Select it.");
    expect(tryIt("A, B and C", 3)).toBe("The three are A, B and C. Select any of them.");
    expect(LAYOUT.fingerprints(1)).toBe("1 source file. The downloaded file names it with its fingerprint.");
    expect(LAYOUT.fingerprints(15)).toBe(
      "15 source files. The downloaded file names each one with its fingerprint."
    );
    expect(LAYOUT.groupMany(1)).toBe("1 kind of detail missing");
    expect(HELP.liveOn(1)).toBe("Explaining this screen. 1 item can be explained. Press Escape to leave.");
    expect(HELP.liveOn(25)).toBe("Explaining this screen. 25 items can be explained. Press Escape to leave.");
  });

  it("passes the writing guards in the singular", () => {
    expect(textProblems(q4(1), { sentence: false })).toEqual([]);
    for (const t of [
      GUIDE.pointToCard(1),
      GUIDE.needNumbered(1, 1),
      GUIDE.needNumbered(1, 3),
      LAYOUT.fingerprints(1),
      HELP.liveOn(1),
    ])
      expect(textProblems(t), t).toEqual([]);
  });
});

describe("the words for a guide, a page and a glossary that are loading", () => {
  it("name what is loading, in the words of the load messages", () => {
    expect(LAYOUT.loadingGuide).toBe("Loading the guide");
    expect(LAYOUT.loadingHow).toBe("Loading How this works");
    expect(LAYOUT.loadingGlossary).toBe("Loading the glossary");
    for (const t of [LAYOUT.loadingGuide, LAYOUT.loadingHow, LAYOUT.loadingGlossary])
      expect(textProblems(t, { sentence: false }), t).toEqual([]);
  });
});
