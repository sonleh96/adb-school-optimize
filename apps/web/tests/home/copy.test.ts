/**
 * The homepage's words.
 *
 * Failure modes, each with the test that catches it:
 *  1. A string breaks the workspace's writing rules: a banned word ("priority", "risk", "excluded"), a bare
 *     "place" for a rank, a rule letter, a dash, a curly quote          -> "every string passes..."
 *  2. A sentence loses its full stop, or a label gains one              -> "every string passes..."
 *  3. A count reads wrong: "1 records", "1 need", or a number where the API gave none
 *                                                                          -> "the figures read..."
 *  4. The page says the paper is published or peer reviewed, which it is not, or calls it "under review", which a
 *     reader takes to mean a journal's review                              -> "the page never claims..."
 *  5. The share bar and its words drift from the main method's shares as the workspace states them
 *                                                                          -> "the shares are..."
 *  6. The homepage or the tool says more than the paper: that a record, once checked, joins the list (the paper
 *     keeps the gate and says a recorded zero needs interpreting first), that the weights were fixed before the
 *     results or worked out from them (the paper calls them policy assumptions), or that no one could trace the
 *     urgency rating (the paper calls its lineage unresolved)          -> "neither the homepage nor the tool..."
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOME, MAIN_SHARES, figuresFor, phraseText, type Phrase } from "@/lib/home/copy";
import { UNKNOWN_COUNTS, type HomeCounts } from "@/lib/home/counts";
import { shareSentence } from "@/lib/screening/copy";
import { PRIMARY_RULE } from "@/lib/screening/rule-pair";

import { Corpus } from "../screening/copy/helpers";

const isPhrase = (value: unknown): value is Phrase =>
  Array.isArray(value) && value.some((part) => typeof part === "object" && part !== null && "accent" in part);

/** Every string the homepage copy holds, with its path. A heading in parts is read as its whole text. */
function strings(value: unknown, at = "HOME"): [string, string][] {
  if (typeof value === "string") return [[at, value]];
  if (isPhrase(value)) return [[at, phraseText(value)]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`));
  return [];
}

/** Keys whose strings are sentences: they must end like one. Every other string is a label or a heading. */
const SENTENCE =
  /\.(?:lead|body|note|line|description|who|why|caption|figuresNote|text)$|\.(?:sentences|items|steps)\[\d+\]$/;

const known = (records: number, inOrder: number, toVerify: number): HomeCounts => ({
  kind: "known",
  records,
  inOrder,
  toVerify,
});

describe("the homepage's words", () => {
  it("every string passes the workspace's writing rules", () => {
    const corpus = new Corpus();
    for (const [at, text] of strings(HOME))
      corpus.add(at, text, { sentence: SENTENCE.test(at) || /[.?]$/.test(text) });
    for (const counts of [known(1, 1, 0), known(2, 1, 1), known(1284, 1100, 184), known(0, 0, 0)])
      for (const f of figuresFor(counts) ?? [])
        corpus.add(`figure ${f.key}`, `${f.value} ${f.label}`, { sentence: false });
    expect(corpus.problems).toEqual([]);
    // The guards ran over the whole copy, not over an empty walk.
    expect(corpus.checked).toBeGreaterThan(50);
  });

  it("the figures read with their numbers, and there are none when the counts are not known", () => {
    const read = (c: HomeCounts) => (figuresFor(c) ?? []).map((f) => `${f.value} ${f.label}`);
    expect(read(known(1, 1, 1))).toEqual([
      "1 secondary school record",
      "1 can be put in order now",
      "1 not in the list yet, because its record needs verifying first",
    ]);
    expect(read(known(1284, 1100, 184))).toEqual([
      "1,284 secondary school records",
      "1,100 can be put in order now",
      "184 not in the list yet, because their records need verifying first",
    ]);
    expect(figuresFor(UNKNOWN_COUNTS)).toBeNull();
    // Without counts the card keeps its three rows, in words: no number, and nothing that points at one.
    expect(HOME.hero.noFigures).toHaveLength(3);
    for (const row of HOME.hero.noFigures)
      expect(`${row.term} ${row.text}`).not.toMatch(/\d|these numbers|the numbers/i);
  });

  it("the page never claims the paper is published or peer reviewed", () => {
    for (const [at, text] of strings(HOME))
      expect(text, at).not.toMatch(/\bpublished\b|\bpeer[- ]review|\bunder review\b/i);
  });

  it("neither the homepage nor the tool says more than the paper about checked records, the weights or urgency", () => {
    const OVERCLAIMS = [
      /\b(?:checked|verified)\b[^.]*\bcan (?:then )?be put in order\b/i,
      /\bset before anyone looked\b|\bworked out from (?:past )?results\b/i,
      /\bno one could trace\b/i,
    ];
    // The probe shows the patterns can see what they bar.
    expect(OVERCLAIMS[0].test("A record that is checked can then be put in order.")).toBe(true);
    const COPY = ["../../lib/home", "../../lib/screening/copy"].flatMap((dir) => {
      const full = path.resolve(__dirname, dir);
      return readdirSync(full)
        .filter((file) => file.endsWith(".ts"))
        .map((file) => [path.join(dir, file), readFileSync(path.join(full, file), "utf8")] as const);
    });
    expect(COPY.length).toBeGreaterThan(20);
    for (const [file, text] of COPY)
      for (const claim of OVERCLAIMS) expect(text, `${file} ${claim}`).not.toMatch(claim);
  });

  it("the shares are the main method's, as the workspace states them", () => {
    const total = Object.values(MAIN_SHARES).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    for (const [key, share] of Object.entries(MAIN_SHARES))
      expect(shareSentence(PRIMARY_RULE, key as keyof typeof MAIN_SHARES), key).toContain(
        `about ${Math.round(share * 100)} percent`
      );
  });
});
