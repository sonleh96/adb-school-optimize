/**
 * The fixed diagram of how much each part counts (components/screening/ScoreTree.tsx), drawn from the rules the API
 * saved (e2e/fixtures/screening/rules.json). Failure modes, each with the test that catches it:
 *  1. A drawn share is not the API's: typed in, rounded, or scaled wrongly under a largest-factor rule
 *                                                    -> "draws every share the API states, for all seven rules"
 *  2. A sum rule's shares do not make up the whole score, or a part's own parts do not make up that part
 *                                                    -> "adds the shares up to the whole score"
 *  3. A need-first rule draws a tree, which would say other inputs can make up for school need
 *                                                    -> "gives a need-first rule its one line, not a tree"
 *  4. The API leaves out or changes how a rule combines its inputs, and the page breaks or the diagram draws a sum
 *     that is not one                                -> "draws nothing it cannot read from the API ..."
 *  5. The diagram's words break the writing rules    -> "words every rule's diagram within the writing rules"
 *  6. A reader who adds up the shares listed under a total gets another number than the one stated, because each
 *     share was rounded                              -> "states no total that the shares under it do not add up to"
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreTree } from "@/components/screening/ScoreTree";
import { RULE_IDS, TERMS, copyFor, ruleOneLine } from "@/lib/screening/copy";
import { SCORE_TREE } from "@/lib/screening/copy/tree";
import { parseWith } from "@/lib/screening/schema";
import { type Share, scoreTreeOf } from "@/lib/screening/score-tree";
import { type Rule, rulesResponse } from "@/lib/screening/types";

import { textProblems } from "./copy/helpers";
import { readFixture } from "./fixtures";

/** The rules as the API sent them, before any parsing. */
interface RawRule {
  rule_id: string;
  weights: { component: string; fraction: string; value: number }[];
  primary_sort_key: string | null;
  maximum_components: string[];
  maximum_share: string;
}
const RAW = (readFixture("rules.json") as { rules: RawRule[] }).rules;
const parse = (body: unknown) => parseWith(rulesResponse, body, "rules").rules;
const RULES = parse(readFixture("rules.json"));
const ruleOf = (id: string): Rule => RULES.find((r) => r.rule_id === id)!;
const NEED_FIRST = RAW.filter((r) => r.primary_sort_key !== null).map((r) => r.rule_id);

const PLAIN = copyFor({ ruleNames: "plain" });
const LETTERED = copyFor({ ruleNames: "lettered" });

/** What each input and each part of school need is called everywhere else in the tool. */
const NAME: Record<string, string> = {
  N: TERMS.school_need.label,
  A: TERMS.area_context.label,
  U: TERMS.urgency.label,
  R: TERMS.reach.label,
  Q: TERMS.air_quality.label,
  E: TERMS.emissions.label,
  L: TERMS.land_cover.label,
};
const NEED_PARTS = [
  TERMS.need_classrooms.label,
  TERMS.need_housing.label,
  TERMS.need_facilities.label,
  TERMS.need_services.label,
  TERMS.need_locality.label,
];

interface Drawn {
  name: string;
  share: string;
  /** The bar's length, in percent of the whole score's. */
  width: number;
  parts: Drawn[];
}

/** Each item of a list as the page draws it: its words and the length of its bar, and its own items. */
function drawnItems(list: Element | null): Drawn[] {
  if (!list) return [];
  return Array.from(list.children).map((item) => {
    const row = item.firstElementChild as HTMLElement;
    // The row's words one by one, the bar left out: its name, then its share.
    const words = Array.from(row.querySelectorAll("*"))
      .filter((el) => el.childElementCount === 0 && !el.closest('[aria-hidden="true"]'))
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);
    const bar = row.querySelector<HTMLElement>('[style*="width"]');
    return {
      name: words[0] ?? "",
      share: words[1] ?? "",
      width: bar ? Number.parseFloat(bar.style.width) : Number.NaN,
      parts: drawnItems(item.querySelector(":scope > ul")),
    };
  });
}

function draw(id: string, copy = LETTERED) {
  const { container } = render(<ScoreTree copy={copy} rule={ruleOf(id)} />);
  const figure = container.querySelector("figure");
  return { figure, items: drawnItems(figure?.querySelector(":scope > ul") ?? null) };
}

/** A fraction as the API writes it ("12/19", "1"), as a number. */
const valueOf = (fraction: string) => {
  const [n, d = "1"] = fraction.split("/");
  return Number(n) / Number(d);
};

/** A share as a percent the way a reader expects it written: whole when it is whole, else to one decimal. */
const written = (share: number) => {
  const percent = share * 100;
  return Math.abs(percent - Math.round(percent)) < 1e-9
    ? String(Math.round(percent))
    : (Math.round(percent * 10) / 10).toFixed(1);
};

interface Expected {
  name: string;
  /** Its share of the whole score, which its bar draws. */
  share: number;
  /** Its share in words. */
  words: string;
  parts: Expected[];
}

/**
 * What the API says to draw: each weight at `scale` of the score, worded as a share of the score at the top and as
 * a share of the combined factors under them; school need with its five equal parts, each a fifth of it.
 */
const fromWeights = (raw: RawRule, scale: number, top: boolean): Expected[] =>
  raw.weights.map((w) => ({
    name: NAME[w.component],
    share: w.value * scale,
    words: top ? `${written(w.value * scale)}%` : SCORE_TREE.ofCombined(written(w.value)),
    parts:
      w.component === "N"
        ? NEED_PARTS.map((name) => ({
            name,
            share: (w.value * scale) / 5,
            words: SCORE_TREE.fifthOfNeed,
            parts: [],
          }))
        : [],
  }));

function expectDrawn(drawn: Drawn[], expected: Expected[], where: string) {
  expect(
    drawn.map((d) => d.name),
    where
  ).toEqual(expected.map((e) => e.name));
  expected.forEach((e, i) => {
    expect(drawn[i].width, `${where} > ${e.name}`).toBeCloseTo(e.share * 100, 9);
    expect(drawn[i].share, `${where} > ${e.name}`).toBe(e.words);
    expectDrawn(drawn[i].parts, e.parts, `${where} > ${e.name}`);
  });
}

describe("the diagram of how much each part counts", () => {
  it("draws every share the API states, for all seven rules", () => {
    expect(RAW.map((r) => r.rule_id).sort()).toEqual([...RULE_IDS].sort());
    for (const raw of RAW) {
      const { figure, items } = draw(raw.rule_id);
      expect(figure, raw.rule_id).not.toBeNull();
      if (NEED_FIRST.includes(raw.rule_id)) {
        expect(items, raw.rule_id).toEqual([]);
        continue;
      }
      // A largest-factor rule: its combined factors at the rest of the score, then the share of the largest input.
      const largest = valueOf(raw.maximum_share);
      const names = raw.maximum_components.map((c) => NAME[c].charAt(0).toLowerCase() + NAME[c].slice(1));
      const expected: Expected[] =
        raw.maximum_components.length === 0
          ? fromWeights(raw, 1, true)
          : [
              {
                name: SCORE_TREE.combined,
                share: 1 - largest,
                words: `${written(1 - largest)}%`,
                parts: fromWeights(raw, 1 - largest, false),
              },
              { name: SCORE_TREE.largest(names), share: largest, words: `${written(largest)}%`, parts: [] },
            ];
      expectDrawn(items, expected, raw.rule_id);
    }
  });

  it("adds the shares up to the whole score", () => {
    const sumRules = RAW.map((r) => r.rule_id).filter((id) => !NEED_FIRST.includes(id));
    expect([...sumRules].sort()).toEqual(
      ["additive_no_u", "additive_u", "benchmark", "bottleneck_no_u", "bottleneck_u"].sort()
    );
    const sum = (shares: readonly Share[]) =>
      shares.reduce((t, s) => ({ n: t.n * s.d + s.n * t.d, d: t.d * s.d }), { n: 0, d: 1 });
    for (const id of sumRules) {
      // Exactly, in the fractions the API states.
      const tree = scoreTreeOf(ruleOf(id));
      if (tree?.kind !== "sum") throw new Error(`${id} has no sum to draw`);
      const whole = sum(tree.branches.map((b) => b.share));
      expect(whole.n, id).toBe(whole.d);
      // And as drawn: the top bars make up the whole score, and every bar's parts make up that bar.
      const { items } = draw(id);
      expect(
        items.reduce((t, d) => t + d.width, 0),
        id
      ).toBeCloseTo(100, 9);
      const partsMakeUp = (d: Drawn) => {
        if (d.parts.length > 0)
          expect(
            d.parts.reduce((t, p) => t + p.width, 0),
            `${id} > ${d.name}`
          ).toBeCloseTo(d.width, 9);
        d.parts.forEach(partsMakeUp);
      };
      items.forEach(partsMakeUp);
    }
  });

  it("gives a need-first rule its one line, not a tree", () => {
    expect([...NEED_FIRST].sort()).toEqual(["need_first_no_u", "need_first_u"]);
    for (const id of ["need_first_u", "need_first_no_u"] as const) {
      const { figure } = draw(id);
      expect(figure, id).not.toBeNull();
      expect(figure!.querySelector("ul, li"), id).toBeNull();
      expect(figure!.querySelector('[style*="width"]'), id).toBeNull();
      expect(figure!.textContent, id).toContain(ruleOneLine(id));
    }
  });

  it("draws nothing it cannot read from the API, and the rules still parse when the API leaves it out", () => {
    const body = readFixture("rules.json") as { rules: Record<string, unknown>[] };
    const firstWeight = (r: Record<string, unknown>) =>
      (r.weights as { component: string; fraction: string; value: number }[])[0];
    // [what is wrong, the change, whether a need-first rule still gets its line]
    const variants: [string, (r: Record<string, unknown>) => void, boolean][] = [
      [
        "no word on how the rule combines its inputs",
        (r) => {
          delete r.primary_sort_key;
          delete r.maximum_components;
          delete r.maximum_share;
        },
        false,
      ],
      [
        "those words in another shape",
        (r) => {
          r.maximum_components = "N,A";
          r.maximum_share = 0.4;
        },
        false,
      ],
      [
        "shares that do not make up the whole score",
        (r) => {
          firstWeight(r).fraction = "1/2";
          firstWeight(r).value = 0.5;
        },
        true,
      ],
      ["a fraction its number disagrees with", (r) => void (firstWeight(r).value = 0.7), true],
      ["an input the engine does not have", (r) => void (firstWeight(r).component = "Z"), true],
    ];
    for (const [label, change, needFirstKept] of variants) {
      const changed = structuredClone(body);
      changed.rules.forEach(change);
      const rules = parse(changed);
      expect(
        rules.map((r) => r.rule_id),
        label
      ).toEqual(RULES.map((r) => r.rule_id));
      for (const rule of rules) {
        const kept = needFirstKept && NEED_FIRST.includes(rule.rule_id);
        expect(scoreTreeOf(rule), `${label}: ${rule.rule_id}`).toEqual(kept ? { kind: "need-first" } : null);
        const { container } = render(<ScoreTree copy={LETTERED} rule={rule} />);
        expect(container.querySelector('[style*="width"]'), `${label}: ${rule.rule_id}`).toBeNull();
        if (!kept) expect(container.innerHTML, `${label}: ${rule.rule_id}`).toBe("");
      }
    }
  });

  it("states no total that the shares under it do not add up to", () => {
    // A share as the page states it: tenths of a percent of the score, or a share of the row it sits under, which
    // names that row ("a fifth of school need"). Read from the words alone, as a reader adding them up would.
    const tenths = (words: string): number | null => {
      const match = /^(?:about )?(\d+)(?:\.(\d))?%$/.exec(words);
      return match ? Number(match[1]) * 10 + Number(match[2] ?? 0) : null;
    };
    const names = (words: string, parent: string) =>
      words.toLowerCase().endsWith(` of ${parent.toLowerCase().replace(/^the /, "")}`) ||
      words.toLowerCase().endsWith(` of the ${parent.toLowerCase().replace(/^the /, "")}`);
    const problems: string[] = [];
    const check = (where: string, total: string | null, parent: string | null, parts: Drawn[]) => {
      if (parts.length === 0) return;
      const relative = parent !== null && parts.every((p) => names(p.share, parent));
      const shares = parts.map((p) => tenths(p.share));
      const stated = total === null ? null : tenths(total);
      if (!relative && shares.some((s) => s === null))
        problems.push(`${where}: shares that neither name their row nor give a percent of the score`);
      else if (!relative && stated !== null && shares.reduce((t, s) => t! + s!, 0) !== stated)
        problems.push(`${where}: ${parts.map((p) => p.share).join(" + ")} is not ${total}`);
      for (const p of parts) check(`${where} > ${p.name}`, p.share, p.name, p.parts);
    };
    for (const copy of [PLAIN, LETTERED])
      for (const id of RULE_IDS) {
        const { figure, items } = draw(id, copy);
        if (items.length === 0) continue;
        // The last row states the whole score's share only when it states one.
        const whole = /(\d+(?:\.\d)?%)$/.exec(figure!.querySelector("[data-row=whole]")?.textContent ?? "");
        check(id, whole ? whole[1] : null, null, items);
        // And it does state it whenever the shares above it, as written, add up to all of the score.
        const top = items.map((item) => tenths(item.share));
        if (top.every((t) => t !== null) && top.reduce((t, s) => t! + s!, 0) === 1000 && !whole)
          problems.push(`${id}: the shares add up to 100%, but the last row does not say so`);
      }
    expect(problems).toEqual([]);
  });

  it("words every rule's diagram within the writing rules", () => {
    const problems: string[] = [];
    for (const copy of [PLAIN, LETTERED])
      for (const id of RULE_IDS) {
        const { figure } = draw(id, copy);
        // Each piece of text on its own: the sentences, then every label, name and share.
        for (const element of Array.from(figure!.querySelectorAll("*")).filter((e) => !e.children.length)) {
          const text = element.textContent ?? "";
          if (!text) continue;
          const sentence = element.tagName === "P" || /\.$/.test(text);
          for (const problem of textProblems(text, { sentence }))
            problems.push(`${id}: ${problem}: ${JSON.stringify(text)}`);
        }
      }
    expect(problems).toEqual([]);
  });
});
