/**
 * `copyFor(data)` returns the whole copy API with the data's counts bound in, so a refresh of the data cannot leave
 * a stale number in a sentence:
 *
 *   const P = copyFor({ schools, pairwise, top20Changes });
 *   P.STRINGS.scopeShort, P.rankSentence(school, ruleId), P.tieNote(school, ruleId) ...
 *
 * Signatures match the module's own functions; data arguments default to the bound data. Build the bound object
 * once, at the data boundary, and pass it down: nothing below the boundary should import the count-free exports.
 */
import { amongAllOrdered, countsFrom, groupsSentence, urgencyDefinition } from "./counts";
import {
  cleanName,
  displayName,
  formatApprox,
  formatCount,
  formatPercent,
  capitalise,
  ordinal,
} from "./format";
import {
  comparisonSentence,
  defaultListStatement,
  defaultListStatementLong,
  findPair,
  urgencyReassurance,
} from "./compare";
import { TRUST_TAIL, buildHow, buildQuestions, howExample } from "./explainer";
import { GUIDE } from "./guide";
import { buildIdeas } from "./ideas";
import {
  missingLabels,
  missingSentence,
  missingSentences,
  missingValueKind,
  missingValueNote,
} from "./missing";
import type {
  CopyRuleId,
  CopySchool,
  CountBag,
  CountsByRule,
  PairwiseRow,
  PlacedSchool,
  Top20Change,
  ComparisonData,
} from "./model";
import {
  type PlaceOpts,
  distinctName,
  fullRankingSentence,
  listStartsSentence,
  locationLine,
  placeContext,
  placeHeadline,
  rangeComparisonSentence,
  rankSentence,
  tieNote,
} from "./rank";
import { contributions, inputSentence, reasonSentence, topDrivers } from "./reasons";
import {
  DEFAULT_RULE,
  RULE_IDS,
  ruleExplanation,
  ruleLabel,
  ruleName,
  ruleOneLine,
  ruleRelation,
  ruleRole,
  ruleRoleLine,
  ruleShortName,
  ruleSource,
  ruleSymbol,
  ruleUsesUrgency,
  shareSentence,
  urgencyNote,
} from "./rules";
import { buildStrings } from "./strings";
import { GLOSSARY_GROUPS, type TermKey, buildTerms } from "./terms";
import { HELP, KEYS, LAYOUT } from "./words";

/**
 * What `copyFor` reads. Give it the full schools and it counts them. Give it `counts` and the schools may be the
 * partial records a list holds, which carry no raw readings to count from. A count left out of `counts` is unknown,
 * and the sentence that would state it is written without the number.
 */
export type CopyData = {
  readonly pairwise?: readonly PairwiseRow[];
  readonly top20Changes?: readonly Top20Change[];
  /** The group sizes of each rule's own run. Without them every rule is taken to count the groups in `counts`. */
  readonly countsByRule?: CountsByRule;
} & (
  | { readonly schools?: readonly CopySchool[]; readonly counts?: CountBag }
  | { readonly schools?: readonly PlacedSchool[]; readonly counts: CountBag }
);

type WithoutCounts = Omit<PlaceOpts, "counts" | "countsByRule">;

export function copyFor(data: CopyData = {}) {
  const schools: readonly PlacedSchool[] = data.schools || [];
  const c: CountBag = data.counts || countsFrom(data.schools || []);
  const bound = {
    pairwise: data.pairwise || [],
    top20Changes: data.top20Changes || [],
    schools,
  };
  const withCounts = (opts?: WithoutCounts): PlaceOpts => ({
    ...(opts || {}),
    counts: c,
    countsByRule: data.countsByRule,
  });
  const terms = buildTerms(c);
  const ideas = buildIdeas(c);
  const trust = findPair(bound.pairwise, "additive_u", "additive_no_u")
    ? `${urgencyReassurance(bound)} ${TRUST_TAIL}`
    : null;
  return Object.freeze({
    counts: c,
    TERMS: terms,
    STRINGS: buildStrings(c),
    IDEAS: ideas,
    LAYOUT: Object.freeze({ ...LAYOUT, amongAll124: capitalise(amongAllOrdered(c)) }),
    HELP,
    KEYS,
    GUIDE,
    GLOSSARY_GROUPS,
    HOW_IT_WORKS: buildHow(c, howExample(bound, c, data.countsByRule)),
    FIRST_QUESTIONS: buildQuestions(ideas, trust),
    RULE_IDS,
    term: (key: TermKey) => {
      const t = terms[key];
      if (!t) throw new Error(`Unknown term: ${key}`);
      return t;
    },
    groupsSentence: () => groupsSentence(c),
    urgencyDefinition: () => urgencyDefinition(c),
    urgencyNote: (id: CopyRuleId, opts?: WithoutCounts) => urgencyNote(id, withCounts(opts)),
    rankSentence: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      rankSentence(school, ruleId, withCounts(opts)),
    placeHeadline: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      placeHeadline(school, ruleId, withCounts(opts)),
    placeContext: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      placeContext(school, ruleId, withCounts(opts)),
    fullRankingSentence: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      fullRankingSentence(school, ruleId, withCounts(opts)),
    rangeComparisonSentence: (school: PlacedSchool, a: CopyRuleId, b: CopyRuleId, opts?: WithoutCounts) =>
      rangeComparisonSentence(school, a, b, withCounts(opts)),
    listStartsSentence: (list: readonly PlacedSchool[] = schools, ruleId: CopyRuleId = DEFAULT_RULE, n = 3) =>
      listStartsSentence(list, ruleId, n),
    comparisonSentence: (
      a: CopyRuleId,
      b: CopyRuleId,
      d: ComparisonData & { top20Changes: readonly Top20Change[] } = bound,
      opts?: { top?: number }
    ) => comparisonSentence(a, b, { schools, ...d }, opts),
    urgencyReassurance: (d: ComparisonData = bound) => urgencyReassurance({ schools, ...d }),
    defaultListStatement: (d: Pick<ComparisonData, "pairwise"> = bound) => defaultListStatement(d),
    defaultListStatementLong: (d: Pick<ComparisonData, "pairwise"> = bound) => defaultListStatementLong(d),
    tieNote: (
      school: PlacedSchool,
      ruleId: CopyRuleId,
      list: readonly PlacedSchool[] = schools,
      form: "card" | "row" = "card"
    ) => tieNote(school, ruleId, list, form),
    distinctName: (school: PlacedSchool, list: readonly PlacedSchool[] = schools) =>
      distinctName(school, list),
    // Functions with no counts, passed through unchanged.
    reasonSentence,
    inputSentence,
    topDrivers,
    contributions,
    missingSentence,
    missingSentences,
    missingLabels,
    missingValueKind,
    missingValueNote,
    displayName,
    cleanName,
    locationLine,
    shareSentence,
    ruleLabel,
    ruleShortName,
    ruleOneLine,
    ruleExplanation,
    ruleRole,
    ruleSource,
    ruleRoleLine,
    ruleRelation,
    ruleName,
    ruleSymbol,
    ruleUsesUrgency,
    ordinal,
    formatCount,
    formatApprox,
    formatPercent,
  });
}

/** The bound copy: what `copyFor` returns. */
export type BoundCopy = ReturnType<typeof copyFor>;
