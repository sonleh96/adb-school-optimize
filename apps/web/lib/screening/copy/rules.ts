/**
 * The seven rules: their names, roles and plain explanations, and a rule's share of each factor in words.
 * The roles follow the revised paper: the combined-factors rule without urgency is its main rule; the three rules
 * from the circulated paper that use urgency are kept as urgency sensitivities; nothing is pending.
 */
import { type Reads, countWord, urgencyDefinition } from "./counts";
import type { CopyRuleId, CountBag } from "./model";

/* ------------------------------------------------------------------- rules */

const CIRCULATED = "As circulated in the earlier paper";
const REVISED = "As set out in the revised paper";

interface RuleInfo {
  readonly symbol: string;
  readonly label: string;
  readonly short: string;
  readonly line: string;
  readonly role: string;
  readonly source: string;
  readonly roleLine?: string;
  readonly relation: string;
  /** One plain line for a first-time reader on how the list is ordered under this rule, with no symbol or term of art. */
  readonly plain: string;
  /** The method in a few words, to finish "Rank in the list under ...". */
  readonly plainName: string;
  readonly name: string;
  readonly usesUrgency: boolean;
  /** Whether the rule reads the air-quality, emissions and land-cover figures. Only the benchmark does not. */
  readonly readsReadings: boolean;
  readonly explanation: string;
}

const RULES: Record<CopyRuleId, RuleInfo> = {
  additive_u: {
    symbol: "S",
    label: "Combined factors, with urgency",
    short: "Combined",
    line: "The score adds up several factors, each with a fixed share, and urgency is one of them.",
    role: "Urgency sensitivity",
    source: CIRCULATED,
    roleLine: "A sensitivity check that puts the urgency rating back, from the circulated paper",
    relation: "The main rule of the circulated paper, kept to show what the urgency rating changes.",
    plain: "Ordered by the earlier paper's method, which adds back the uncertain urgency rating.",
    plainName: "the earlier paper's method",
    name: "the combined-factors rule with urgency (S)",
    usesUrgency: true,
    readsReadings: true,
    explanation:
      "Adds up several factors for each school, each with a fixed share, to give its score. " +
      "School need, built from five parts of the school's own record, counts for 60%, district context for 15%, and urgency, walking reach, air quality, emissions and land cover for 5% each. " +
      "A high value in one input can make up for a low value in another. " +
      "This was the main rule in the circulated paper. The revised paper keeps it as a sensitivity check that puts the urgency rating back, because no one could trace where that value comes from.",
  },
  additive_no_u: {
    symbol: "S0",
    label: "Combined factors, without urgency",
    short: "Combined, no urgency",
    line: "The score adds up several factors, each with a fixed share, and leaves urgency out.",
    role: "Main rule",
    source: REVISED,
    roleLine: "The main rule of the revised paper, which leaves urgency out",
    relation: "The main rule of the revised paper, which leaves urgency out.",
    plain: "Ordered by the research paper's main method, which leaves out the uncertain urgency rating.",
    plainName: "the research paper's main method",
    name: "the combined-factors rule without urgency (S0)",
    usesUrgency: false,
    readsReadings: true,
    explanation:
      "The main rule of the revised paper. It leaves the urgency rating out because no one could trace where it comes from; that says nothing about whether schools face real hazards. " +
      "The other factors keep their shares in proportion: school need, built from five parts of the school's own record, about 63%, district context about 16%, and walking reach, air quality, emissions and land cover about 5% each. " +
      "A high value in one input can make up for a low value in another.",
  },
  need_first_u: {
    symbol: "NF",
    label: "Need-first rule, with urgency",
    short: "Need first",
    line: "Schools go in order of school need, and other factors, urgency included, only break exact ties.",
    role: "Urgency sensitivity",
    source: CIRCULATED,
    relation: "The circulated paper's strict alternative, with urgency, kept as a sensitivity check.",
    plain: "Ordered by school need alone; everything else, the urgency rating included, only settles ties.",
    plainName: "school need alone, with the urgency rating settling ties",
    name: "the need-first rule with urgency (NF)",
    usesUrgency: true,
    readsReadings: true,
    explanation:
      "Puts schools in order of school need alone, the measure built from five parts of the school's own record. " +
      "The other inputs, urgency included, only decide the order between schools whose school need is exactly equal. " +
      "Nothing else can make up for lower school need.",
  },
  need_first_no_u: {
    symbol: "NF0",
    label: "Need-first rule, without urgency",
    short: "Need first, no urgency",
    line: "Schools go in order of school need, and other factors, without urgency, only break exact ties.",
    role: "Strict alternative",
    source: REVISED,
    relation: "The revised paper's strict alternative, which puts school need first and leaves urgency out.",
    plain:
      "Ordered by school need alone; everything else only settles ties, and the uncertain urgency rating is left out.",
    plainName: "school need alone",
    name: "the need-first rule without urgency (NF0)",
    usesUrgency: false,
    readsReadings: true,
    explanation:
      "Puts schools in order of school need alone, the measure built from five parts of the school's own record. " +
      "The other inputs, without urgency, only decide the order between schools whose school need is exactly equal. " +
      "It is the strict alternative for anyone who does not want other inputs to make up for lower school need.",
  },
  bottleneck_u: {
    symbol: "T",
    label: "Largest-factor rule, with urgency",
    short: "Largest factor",
    line: "Most of the score comes from the combined factors with urgency, plus an extra share for the school's largest single factor.",
    role: "Urgency sensitivity",
    source: CIRCULATED,
    relation:
      "The circulated paper's largest-factor rule, with urgency, kept as a sensitivity check that gives an extra share to each school's largest factor.",
    plain:
      "Ordered by a combined score that gives extra weight to a school's largest factor, school need, district conditions or the urgency rating.",
    plainName: "a combined score with extra weight on a school's largest factor, urgency rating included",
    name: "the largest-factor rule with urgency (T)",
    usesUrgency: true,
    readsReadings: true,
    explanation:
      "Takes 60% of the score from the combined-factors rule with urgency and adds 40% of whichever is largest: the school's need, its district context or its urgency rating. " +
      "School need is built from five parts of the school's own record. " +
      "This gives an extra share to a school's single largest input. " +
      "It is still a blend of inputs, not a cut-off or a safety threshold.",
  },
  bottleneck_no_u: {
    symbol: "T0",
    label: "Largest-factor rule, without urgency",
    short: "Largest factor, no urgency",
    line: "Most of the score comes from the combined factors without urgency, plus an extra share for the school's largest single factor.",
    role: "Sensitivity check",
    source: REVISED,
    relation:
      "A sensitivity check from the revised paper that gives an extra share to each school's largest factor and leaves urgency out.",
    plain:
      "Ordered by a combined score that gives extra weight to a school's larger factor, school need or district conditions; the uncertain urgency rating is left out.",
    plainName: "a combined score with extra weight on a school's larger factor",
    name: "the largest-factor rule without urgency (T0)",
    usesUrgency: false,
    readsReadings: true,
    explanation:
      "Takes 60% of the score from the combined-factors rule without urgency and adds 40% of whichever is larger: the school's need or its district context. " +
      "School need is built from five parts of the school's own record. " +
      "It shows how much the list changes when one large input gets an extra share. " +
      "It is a sensitivity check, not a cut-off or a safety threshold.",
  },
  benchmark: {
    symbol: "B",
    label: "Conventional benchmark",
    short: "Benchmark",
    line: "A conventional mix of four factors with fixed shares, kept for comparison.",
    role: "Reference",
    source: CIRCULATED,
    relation: "A conventional mix of factors, with urgency, from the circulated paper, kept for comparison.",
    plain:
      "Ordered by a conventional mix of school need, district conditions, the urgency rating and how many people live nearby, kept for comparison.",
    plainName: "the conventional mix, kept for comparison",
    name: "the conventional benchmark (B)",
    usesUrgency: true,
    readsReadings: false,
    explanation:
      "A conventional mix of four factors with fixed shares, kept for comparison. " +
      "School need, built from five parts of the school's own record, counts for 55%, district context for 20%, urgency for 15% and walking reach for 10%. " +
      "It leaves out air quality, emissions and land cover.",
  },
};

export const RULE_IDS: readonly CopyRuleId[] = Object.freeze(Object.keys(RULES) as CopyRuleId[]);
/**
 * The rule the revised paper adopts as its main rule, and the circulated paper's rule that is kept beside it as the
 * labelled urgency sensitivity. The copy's words follow these two.
 */
export const PRIMARY_RULE: CopyRuleId = "additive_no_u";
export const SENSITIVITY_RULE: CopyRuleId = "additive_u";
/**
 * The names the screen's wiring still uses for the pair: the rule it opens on, and the rule it is compared with.
 * They say nothing about roles; `PRIMARY_RULE` and `SENSITIVITY_RULE` do.
 */
export const DEFAULT_RULE: CopyRuleId = "additive_u";
export const PROPOSED_RULE: CopyRuleId = "additive_no_u";

/** True for the seven rules the copy has words for. The API may carry others, which the copy ignores. */
export const isCopyRuleId = (id: string): id is CopyRuleId => (RULE_IDS as readonly string[]).includes(id);

/** The number of rules, as a word. Kept here because it counts `RULE_IDS`. */
export const ruleCountWord = (): string => countWord(RULE_IDS.length);

export const rule = (id: CopyRuleId): RuleInfo => {
  const r = RULES[id];
  if (!r) throw new Error(`Unknown rule id: ${id}`);
  return r;
};
export const ruleLabel = (id: CopyRuleId) => rule(id).label;
export const ruleExplanation = (id: CopyRuleId) => rule(id).explanation;
// One plain sentence on how the rule orders schools, for the rule switch and headline.
export const ruleOneLine = (id: CopyRuleId) => rule(id).line;
export const ruleRole = (id: CopyRuleId) => rule(id).role;
export const ruleSource = (id: CopyRuleId) => rule(id).source;
// One display line: "Strict alternative, from the revised paper".
const SOURCE_IN_LINE: Record<string, string> = {
  [CIRCULATED]: "from the circulated paper",
  [REVISED]: "from the revised paper",
};
export const ruleRoleLine = (id: CopyRuleId): string =>
  rule(id).roleLine || `${rule(id).role}, ${SOURCE_IN_LINE[rule(id).source]}`;
// The method in a few words, to finish "under ..." in plain views. The one plain line on how the list is ordered
// under a rule is LAYOUT.ruleNow.
export const rulePlainName = (id: CopyRuleId) => rule(id).plainName;
// How a rule relates to the revised paper's main rule, in one sentence.
export const ruleRelation = (id: CopyRuleId) => rule(id).relation;
// The letter is analyst shorthand. Plain copy always pairs it with words, as ruleName does.
export const ruleSymbol = (id: CopyRuleId) => rule(id).symbol;
export const ruleName = (id: CopyRuleId) => rule(id).name;
// Words, for tight spaces such as tabs and chips.
export const ruleShortName = (id: CopyRuleId) => rule(id).short;
export const ruleUsesUrgency = (id: CopyRuleId) => rule(id).usesUrgency;
/** The inputs a rule reads (`required_components` in the engine), which decide what "every input recorded" means. */
export const ruleReads = (id: CopyRuleId): Reads => ({
  urgency: rule(id).usesUrgency,
  readings: rule(id).readsReadings,
});
export const urgencyNote = (id: CopyRuleId, opts: { counts?: CountBag } = {}): string =>
  rule(id).usesUrgency
    ? `This rule uses the urgency rating. ${urgencyDefinition(opts.counts)}`
    : `Left out by this rule. ${urgencyDefinition(opts.counts)}`;

// A rule's share for one factor, in words, for breakdown rows in place of "x 0.60".
// key: 'N', 'A', 'U', 'R', 'Q', 'E', 'L' or 'need_part'.
export type FactorKey = "N" | "A" | "U" | "R" | "Q" | "E" | "L" | "need_part";
const FACTOR_NAME: Record<FactorKey, string> = {
  N: "School need",
  A: "District context",
  U: "The urgency rating",
  R: "Walking reach",
  Q: "Air quality",
  E: "Nearby emissions",
  L: "Land cover",
  need_part: "Each part of school need",
};
type ShareBase = "additive_u" | "additive_no_u" | "benchmark";
const BASE_SHARES: Record<ShareBase, Partial<Record<FactorKey, number>>> = {
  additive_u: { N: 0.6, A: 0.15, U: 0.05, R: 0.05, Q: 0.05, E: 0.05, L: 0.05 },
  additive_no_u: { N: 12 / 19, A: 3 / 19, R: 1 / 19, Q: 1 / 19, E: 1 / 19, L: 1 / 19 },
  benchmark: { N: 0.55, A: 0.2, U: 0.15, R: 0.1 },
};
const percentWords = (w: number): string => {
  const v = w * 100;
  return Math.abs(v - Math.round(v)) < 1e-9 ? `${Math.round(v)} percent` : `about ${Math.round(v)} percent`;
};
export function shareSentence(id: CopyRuleId, key: FactorKey): string {
  const r = rule(id);
  const name = FACTOR_NAME[key];
  if (!name) throw new Error(`No factor called ${key}`);
  if (key === "U" && !r.usesUrgency) return `${name} is left out by this rule.`;
  if (id === "need_first_u" || id === "need_first_no_u") {
    if (key === "N") return "School need sets the order under this rule.";
    if (key === "need_part") return "Each part of school need counts equally towards school need.";
    return `${name} only breaks exact ties between schools with the same school need.`;
  }
  const largest = id === "bottleneck_u" || id === "bottleneck_no_u";
  const baseId: ShareBase =
    id === "bottleneck_u" ? "additive_u" : id === "bottleneck_no_u" ? "additive_no_u" : id;
  const base = BASE_SHARES[baseId];
  const k = key === "need_part" ? "N" : key;
  const w = ((base[k] ?? 0) * (largest ? 0.6 : 1)) / (key === "need_part" ? 5 : 1);
  if (w === 0) return `${name} is left out by this rule.`;
  const head = `${name} counts for ${percentWords(w)} of the score`;
  if (largest && (k === "N" || k === "A" || (k === "U" && id === "bottleneck_u"))) {
    const extra = key === "need_part" ? "a further 8 percent" : "a further 40 percent";
    const subject = key === "need_part" ? "school need" : name.charAt(0).toLowerCase() + name.slice(1);
    return `${head}, and ${extra} of the score when ${subject} is the school's largest factor.`;
  }
  return `${head}.`;
}
