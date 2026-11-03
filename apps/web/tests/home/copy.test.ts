/**
 * The homepage's words.
 *
 * Failure modes, each with the test that catches it:
 *  1. A string breaks the workspace's writing rules: a banned word ("priority", "risk", "excluded"), a bare
 *     "place" for a rank, a rule letter, a dash, a curly quote          -> "every string passes..."
 *  2. A sentence loses its full stop, or a label gains one              -> "every string passes..."
 *  3. A count reads wrong: "1 records", "1 need", or a number where the API gave none
 *                                                                          -> "the figures read..."
 *  4. The page says the paper is published or peer reviewed, which it is not
 *                                                                          -> "the page never claims..."
 *  5. The share bar and its words drift from the main method's shares as the workspace states them
 *                                                                          -> "the shares are..."
 */
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
  /\.(?:lead|body|note|line|description|about|caveat|figuresNote|pathCaption)$|\.(?:sentences|items|noFigures)\[\d+\]$/;

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
      for (const f of figuresFor(counts) ?? []) {
        corpus.add(`figure ${f.key}`, `${f.value} ${f.label}`, { sentence: false });
        corpus.add(`figure ${f.key} title`, f.title, { sentence: false });
      }
    expect(corpus.problems).toEqual([]);
    // The guards ran over the whole copy, not over an empty walk.
    expect(corpus.checked).toBeGreaterThan(60);
  });

  it("the figures read with their numbers, and there are none when the counts are not known", () => {
    const read = (c: HomeCounts) => (figuresFor(c) ?? []).map((f) => `${f.value} ${f.label}`);
    const titles = (c: HomeCounts) => (figuresFor(c) ?? []).map((f) => `${f.value} ${f.title}`);
    expect(read(known(1, 1, 1))).toEqual([
      "1 secondary school record",
      "1 can be put in order now",
      "1 needs its record verified first",
    ]);
    expect(titles(known(1, 1, 1))).toEqual([
      "1 School record gathered",
      "1 Can be put in order",
      "1 Needs verifying first",
    ]);
    expect(read(known(1284, 1100, 184))).toEqual([
      "1,284 secondary school records",
      "1,100 can be put in order now",
      "184 need their records verified first",
    ]);
    expect(titles(known(1284, 1100, 184))).toEqual([
      "1,284 School records gathered",
      "1,100 Can be put in order",
      "184 Need verifying first",
    ]);
    expect(figuresFor(UNKNOWN_COUNTS)).toBeNull();
    // Without counts the card's sentences stand alone: no number, and nothing that points at one.
    for (const text of HOME.hero.noFigures) expect(text).not.toMatch(/\d|these numbers|the numbers/i);
  });

  it("the page never claims the paper is published or peer reviewed", () => {
    for (const [at, text] of strings(HOME)) expect(text, at).not.toMatch(/\bpublished\b|\bpeer[- ]review/i);
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
