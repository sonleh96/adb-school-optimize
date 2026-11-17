/**
 * How a rule's parts make up its score, as the fixed diagram in How this works and the method details draws it.
 *
 * Every share is the API's own (`/rules`), read from the exact fraction it states, so the drawing never rounds a
 * share and never holds one typed in. The structure follows the engine: school need is the plain mean of its five
 * parts (`prepare` in `components.py`); an additive rule adds up its weights; a largest-factor rule takes
 * `1 - maximum_share` of that sum and `maximum_share` of the largest of `maximum_components` (`_score_bounds` in
 * `engine.py`); a need-first rule orders by school need and adds up the rest only to separate exact ties.
 *
 * A rule whose description does not fit that structure gets no tree: a drawing that says the shares add up to the
 * whole score must not show shares that do not.
 */
import type { TermKey } from "./copy/terms";
import type { Rule } from "./types";

/** An exact share of the score, as a fraction in lowest terms. */
export interface Share {
  readonly n: number;
  readonly d: number;
}

/** The engine's seven inputs (`Component` in `rules.py`). */
export type Input = "N" | "A" | "U" | "R" | "Q" | "E" | "L";
const INPUTS: readonly string[] = ["N", "A", "U", "R", "Q", "E", "L"] satisfies readonly Input[];
const isInput = (value: string): value is Input => INPUTS.includes(value);

/** School need's five parts, in the engine's order (`NeedParts` in `components.py`). */
const NEED_PARTS = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
] as const;
export type NeedPart = (typeof NEED_PARTS)[number];

/**
 * The glossary term of each input and each part of school need, whose label names it wherever the tool draws the
 * parts of a score: the diagram of each part's share, and the explore page's bars of what each part adds.
 */
export const INPUT_TERM = {
  N: "school_need",
  A: "area_context",
  U: "urgency",
  R: "reach",
  Q: "air_quality",
  E: "emissions",
  L: "land_cover",
} as const satisfies Record<Input, TermKey>;
export const NEED_PART_TERM = {
  permanent_classroom_deficit: "need_classrooms",
  teacher_housing_deficit: "need_housing",
  facility_presence_deficit: "need_facilities",
  service_deficit: "need_services",
  locality_disadvantage: "need_locality",
} as const satisfies Record<NeedPart, TermKey>;

/** What one branch of the tree stands for. */
export type Part =
  | { readonly kind: "input"; readonly input: Input }
  | { readonly kind: "need-part"; readonly part: NeedPart }
  /** A largest-factor rule's combined-factors term. */
  | { readonly kind: "combined" }
  /** A largest-factor rule's extra term: its share of whichever of `of` is largest for the school. */
  | { readonly kind: "largest"; readonly of: readonly Input[] };

export interface Branch {
  readonly part: Part;
  /** Its share of the whole score. */
  readonly share: Share;
  /** What it is made of, whose shares add up to its own. Empty for a single part. */
  readonly children: readonly Branch[];
}

export type ScoreTree =
  /** The score adds up these branches, whose shares add up to the whole score. */
  | { readonly kind: "sum"; readonly branches: readonly Branch[] }
  /** School need sets the order, and the other inputs only separate exact ties. */
  | { readonly kind: "need-first" };

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const fraction = (n: number, d: number): Share => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};
const ZERO: Share = { n: 0, d: 1 };
/** The whole score. */
export const WHOLE: Share = { n: 1, d: 1 };
const times = (a: Share, b: Share): Share => fraction(a.n * b.n, a.d * b.d);
const plus = (a: Share, b: Share): Share => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a: Share, b: Share): Share => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const same = (a: Share, b: Share): boolean => a.n === b.n && a.d === b.d;
const FIFTH = fraction(1, NEED_PARTS.length);

/** A fraction as the API writes one (Python's `str(Fraction)`: "12/19", "1", "0"), or null for anything else. */
function parseShare(text: string): Share | null {
  const match = /^(\d+)(?:\/(\d+))?$/.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  const d = match[2] === undefined ? 1 : Number(match[2]);
  return Number.isSafeInteger(n) && Number.isSafeInteger(d) && d > 0 ? fraction(n, d) : null;
}

/** A share as a percentage, exactly, for the length of its bar. */
export const percentOf = (share: Share): number => (100 * share.n) / share.d;

/** A share in tenths of a percent, as the page writes it. */
const tenthsOf = (share: Share): number => Math.round((1000 * share.n) / share.d);

/**
 * A share as the page writes it, without the sign: a whole number of percent when it is one ("60"), else rounded to
 * one decimal ("63.2"). Nineteenths have no exact decimal, so the written shares of a rule such as S0 can add up to a
 * little more or less than their total; `writtenTotal` says when they do not.
 */
export function percentText(share: Share): string {
  if ((100 * share.n) % share.d === 0) return String((100 * share.n) / share.d);
  const tenths = tenthsOf(share);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** The total the written shares add up to, as it would be written, or null when it is not the exact total. */
export function writtenTotal(shares: readonly Share[]): string | null {
  const exact = shares.reduce((sum, s) => plus(sum, s), ZERO);
  return shares.reduce((sum, s) => sum + tenthsOf(s), 0) === tenthsOf(exact) ? percentText(exact) : null;
}

/** One share as a share of another, such as a part of the combined factors as a share of them. */
export const shareOf = (part: Share, whole: Share): Share => fraction(part.n * whole.d, part.d * whole.n);

/** The rule's weights, each a known input stated once with a fraction its number agrees with; null otherwise. */
function weightsOf(rule: Rule): { readonly input: Input; readonly share: Share }[] | null {
  const out: { input: Input; share: Share }[] = [];
  for (const w of rule.weights) {
    const share = parseShare(w.fraction);
    if (!share || !isInput(w.component) || out.some((o) => o.input === w.component)) return null;
    if (Math.abs(share.n / share.d - w.value) > 1e-12) return null;
    if (share.n > 0) out.push({ input: w.component, share });
  }
  return out;
}

/** The weights as branches at `scale` of the score; school need's branch holds its five parts. */
const branchesOf = (weights: { readonly input: Input; readonly share: Share }[], scale: Share): Branch[] =>
  weights.map(({ input, share: weight }) => {
    const share = times(weight, scale);
    const children =
      input === "N"
        ? NEED_PARTS.map((part) => ({
            part: { kind: "need-part" as const, part },
            share: times(share, FIFTH),
            children: [],
          }))
        : [];
    return { part: { kind: "input" as const, input }, share, children };
  });

/** The tree of one rule from the API, or null when the API does not say how the rule combines its inputs. */
export function scoreTreeOf(rule: Rule): ScoreTree | null {
  const { primary_sort_key: sortKey, maximum_components: largestOf, maximum_share: largestText } = rule;
  if (sortKey === undefined || largestOf === undefined || largestText === undefined) return null;
  if (sortKey !== null) return sortKey === "N" ? { kind: "need-first" } : null;

  const weights = weightsOf(rule);
  const largest = parseShare(largestText);
  if (!weights || !largest) return null;
  const total = weights.reduce((sum, w) => plus(sum, w.share), ZERO);
  if (!same(total, WHOLE)) return null;

  if (largestOf.length === 0)
    return same(largest, ZERO) ? { kind: "sum", branches: branchesOf(weights, WHOLE) } : null;
  const of = largestOf.filter(isInput);
  if (of.length !== largestOf.length || largest.n === 0 || largest.n >= largest.d) return null;
  const combined = minus(WHOLE, largest);
  return {
    kind: "sum",
    branches: [
      { part: { kind: "combined" }, share: combined, children: branchesOf(weights, combined) },
      { part: { kind: "largest", of }, share: largest, children: [] },
    ],
  };
}
