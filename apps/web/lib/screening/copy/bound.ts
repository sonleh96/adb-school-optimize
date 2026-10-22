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
import { countsFrom, groupsSentence, urgencyDefinition } from "./counts";
import { cleanName, displayName, formatApprox, formatCount, formatPercent, ordinal } from "./format";
import {
  comparisonSegments,
  comparisonSentence,
  defaultListStatement,
  defaultListStatementLong,
  urgencyReassurance,
} from "./compare";
import { buildIdeas } from "./ideas";
import type { LaterCopy } from "./later";
import type { Method } from "./method";
import { retryable } from "./once";
import {
  missingGroupLabel,
  missingLabels,
  rangeRowWhy,
  missingSentence,
  missingSentences,
  missingValueKind,
  missingValueNote,
} from "./missing";
import type {
  CopyRuleId,
  CopySchool,
  CountBag,
  CountsByRuleArg,
  PairwiseRow,
  PersistenceRule,
  PersistenceTest,
  PlacedSchool,
  Top20Change,
  ComparisonData,
} from "./model";
import {
  type PlaceOpts,
  distinctName,
  fullRankingSentence,
  listStartsSegments,
  listStartsSentence,
  locationLine,
  countsOf,
  persistenceNote,
  placeContext,
  placeHeadline,
  provinceHeading,
  provinceLabel,
  rowPlace,
  scopesMix,
  rangeComparisonSegments,
  rangeComparisonSentence,
  rankSegments,
  rankSentence,
  tieNote,
  tieNoteSegments,
} from "./rank";
import { contributions, inputSentence, reasonSentence, topDrivers } from "./reasons";
import {
  PRIMARY_RULE,
  RULE_IDS,
  type RuleNames,
  ruleExplanation,
  ruleLabel,
  ruleName,
  ruleOneLine,
  rulePlainName,
  ruleReads,
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
import { buildScope, buildStrings } from "./strings";
import { type TermKey, buildTerms } from "./terms";
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
  readonly countsByRule?: CountsByRuleArg;
  /**
   * How the sentences name a rule: "lettered" (the default) adds the analyst's letter, as in "the combined-factors rule
   * without urgency (S0)", which method details keep; "plain" names the method in words, which a first visit reads.
   * `ruleName` follows it, so a caller that puts the name into a sentence of its own follows too.
   */
  readonly ruleNames?: RuleNames;
  /** Each persistence test's margin as a fraction (its own list's provenance block), by rule. */
  readonly margins?: Partial<Record<PersistenceRule, number>>;
  /** How each persistence test was drawn (its own list's provenance block), by rule, for the method details. */
  readonly tests?: Partial<Record<PersistenceRule, PersistenceTest>>;
} & (
  | { readonly schools?: readonly CopySchool[]; readonly counts?: CountBag }
  | { readonly schools?: readonly PlacedSchool[]; readonly counts: CountBag }
);

type WithoutCounts = Omit<PlaceOpts, "counts" | "countsByRule" | "schools">;

/** The counts without the sizes of the groups, which belong to one rule. */
const GROUP_KEYS = ["complete", "range", "ranked", "queue"] as const;
const groupFree = (c: CountBag): CountBag =>
  Object.fromEntries(Object.entries(c).filter(([k]) => !(GROUP_KEYS as readonly string[]).includes(k)));

export function copyFor(data: CopyData = {}) {
  // A frozen snapshot: the copy says what the data said when it was bound, and a list kept frozen can be indexed.
  const schools: readonly PlacedSchool[] = Object.freeze([...(data.schools || [])]);
  // Counts given with schools that hold results under several rules is the API's shape. The groups differ between
  // rules there, so a sentence about one school under two rules needs each rule's own counts.
  if (
    data.counts &&
    data.countsByRule === undefined &&
    schools.some((s) => s.results && Object.keys(s.results).length > 1)
  )
    throw new Error(
      'copyFor: the schools hold results under more than one rule, and the groups differ between rules. Give countsByRule (countsByRuleFromResults), or build the copy with bindCopy. Pass "shared" only for data of one run.'
    );
  const c: CountBag = data.counts || countsFrom(data.schools || []);
  const bound = {
    pairwise: data.pairwise || [],
    top20Changes: data.top20Changes || [],
    schools,
  };
  const names = data.ruleNames;
  const withCounts = (opts?: WithoutCounts): PlaceOpts => ({
    ruleNames: names,
    ...(opts || {}),
    counts: c,
    countsByRule: data.countsByRule,
    schools,
  });
  // The sizes of the groups belong to one rule, and the definitions of the whole method belong to none: the bound
  // TERMS and the ideas are worded without any group size, the explainer from the paper's main rule, and what a
  // screen shows under a rule comes from that rule's own counts (`termsFor`, `scope`).
  const main = countsOf(withCounts(), PRIMARY_RULE) ?? {};
  const terms = buildTerms(groupFree(c));
  const countsFor = (ruleId: CopyRuleId): CountBag => {
    const own = countsOf(withCounts(), ruleId);
    if (own === c) return own;
    if (!own) return { ...groupFree(c), flagged: undefined };
    // Counts taken from the rows of the list bound describe that list, not another rule's.
    const rest =
      own.ranked === c.ranked
        ? groupFree(c)
        : { ...groupFree(c), emissionsNone: undefined, airMissing: undefined };
    // The flag count belongs to the one rule whose test it counts, so no other rule reads it.
    return { ...rest, flagged: undefined, ...own };
  };
  // Resolves to the same object every time, and tries again after a download that failed.
  const loadLater = retryable(() =>
    import("./later").then((m) => m.laterFor({ counts: main, data: bound, countsByRule: data.countsByRule }))
  );
  // The method details' words load apart from the guide, because only the method details read them.
  const loadMethod = retryable(() => import("./method"));
  return Object.freeze({
    counts: c,
    TERMS: terms,
    STRINGS: buildStrings(c),
    IDEAS: buildIdeas(main),
    LAYOUT,
    HELP,
    KEYS,
    RULE_IDS,
    /**
     * The guide, How this works, its worked example, the first questions and the glossary, loaded on first use so
     * the list and the card ship without them. Resolves to the same object every time.
     */
    later: (): Promise<LaterCopy> => loadLater(),
    term: (key: TermKey) => {
      const t = terms[key];
      if (!t) throw new Error(`Unknown term: ${key}`);
      return t;
    },
    /** What the groups of schools are under one rule: its counts and the inputs it reads. */
    scope: (ruleId: CopyRuleId) => buildScope(countsOf(withCounts(), ruleId), ruleReads(ruleId)),
    /**
     * The method details' words for one rule: its group sizes and the inputs it reads. Loaded on first use, like the
     * guide, so a plain view never ships them.
     */
    methodFor: (ruleId: CopyRuleId): Promise<Method> =>
      loadMethod().then((m) =>
        m.buildMethod({ counts: countsFor(ruleId), reads: ruleReads(ruleId), tests: data.tests })
      ),
    /** The terms worded for one rule: its group sizes and the inputs it reads. */
    termsFor: (ruleId: CopyRuleId) => buildTerms(countsFor(ruleId), ruleReads(ruleId), ruleId),
    groupsSentence: (ruleId: CopyRuleId) => groupsSentence(countsOf(withCounts(), ruleId), ruleReads(ruleId)),
    urgencyDefinition: () => urgencyDefinition(c),
    urgencyNote: (id: CopyRuleId, opts?: WithoutCounts) => urgencyNote(id, withCounts(opts)),
    rankSentence: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      rankSentence(school, ruleId, withCounts(opts)),
    placeHeadline: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      placeHeadline(school, ruleId, withCounts(opts)),
    scopesMix: (list: readonly PlacedSchool[] = schools, ruleId: CopyRuleId = PRIMARY_RULE) =>
      scopesMix(list, ruleId),
    rowPlace: (
      school: PlacedSchool,
      ruleId: CopyRuleId,
      list: readonly PlacedSchool[] = schools,
      opts?: WithoutCounts
    ) => rowPlace(school, ruleId, list, withCounts(opts)),
    placeContext: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      placeContext(school, ruleId, withCounts(opts)),
    fullRankingSentence: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
      fullRankingSentence(school, ruleId, withCounts(opts)),
    rangeComparisonSentence: (school: PlacedSchool, a: CopyRuleId, b: CopyRuleId, opts?: WithoutCounts) =>
      rangeComparisonSentence(school, a, b, withCounts(opts)),
    listStartsSentence: (list: readonly PlacedSchool[] = schools, ruleId: CopyRuleId = PRIMARY_RULE, n = 3) =>
      listStartsSentence(list, ruleId, n, names),
    comparisonSentence: (
      a: CopyRuleId,
      b: CopyRuleId,
      d: ComparisonData & { top20Changes: readonly Top20Change[] } = bound,
      opts?: { top?: number }
    ) => comparisonSentence(a, b, { schools, ...d }, { ruleNames: names, ...opts }),
    urgencyReassurance: (d: ComparisonData = bound) => urgencyReassurance({ schools, ...d }),
    defaultListStatement: (d: Pick<ComparisonData, "pairwise"> = bound) => defaultListStatement(d),
    defaultListStatementLong: (d: Pick<ComparisonData, "pairwise"> = bound) =>
      defaultListStatementLong(d, names),
    tieNote: (
      school: PlacedSchool,
      ruleId: CopyRuleId,
      list: readonly PlacedSchool[] = schools,
      form: "card" | "row" = "card"
    ) => tieNote(school, ruleId, list, form),
    persistenceNote: (school: CopySchool, ruleId: CopyRuleId) =>
      persistenceNote(school, ruleId, {
        margin: (data.margins as Record<string, number | undefined> | undefined)?.[ruleId],
      }),
    distinctName: (school: PlacedSchool, list: readonly PlacedSchool[] = schools) =>
      distinctName(school, list),
    /**
     * The sentences that put a name in them, as segments: the plain text with each name marked (see `segments.ts`).
     * `textOf` of one is exactly what the matching string function returns. `howExample` is the worked example in
     * How this works, or null when the data holds none.
     */
    segments: Object.freeze({
      rankSentence: (school: PlacedSchool, ruleId: CopyRuleId, opts?: WithoutCounts) =>
        rankSegments(school, ruleId, withCounts(opts)),
      rangeComparisonSentence: (school: PlacedSchool, a: CopyRuleId, b: CopyRuleId, opts?: WithoutCounts) =>
        rangeComparisonSegments(school, a, b, withCounts(opts)),
      listStartsSentence: (
        list: readonly PlacedSchool[] = schools,
        ruleId: CopyRuleId = PRIMARY_RULE,
        n = 3
      ) => listStartsSegments(list, ruleId, n, names),
      comparisonSentence: (
        a: CopyRuleId,
        b: CopyRuleId,
        d: ComparisonData & { top20Changes: readonly Top20Change[] } = bound,
        opts?: { top?: number }
      ) => comparisonSegments(a, b, { schools, ...d }, { ruleNames: names, ...opts }),
      tieNote: (
        school: PlacedSchool,
        ruleId: CopyRuleId,
        list: readonly PlacedSchool[] = schools,
        form: "card" | "row" = "card"
      ) => tieNoteSegments(school, ruleId, list, form),
    }),
    // Functions with no counts, passed through unchanged.
    reasonSentence: (school: CopySchool, ruleId: CopyRuleId) => reasonSentence(school, ruleId, names),
    inputSentence,
    topDrivers,
    contributions,
    missingSentence,
    missingSentences,
    missingLabels,
    missingGroupLabel,
    rangeRowWhy,
    provinceHeading,
    provinceLabel,
    missingValueKind,
    missingValueNote,
    displayName,
    cleanName,
    locationLine,
    shareSentence,
    ruleLabel,
    ruleShortName,
    ruleOneLine,
    rulePlainName,
    ruleExplanation,
    ruleRole,
    ruleSource,
    ruleRoleLine,
    ruleRelation,
    ruleName: (id: CopyRuleId) => ruleName(id, names),
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
