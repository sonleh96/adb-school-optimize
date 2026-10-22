/**
 * The words that only the method details show (Show method details on), or that go into a downloaded file or a
 * copied record. A plain view never reads them, so this module is loaded on demand like the guide: reach it through
 * the bound copy's `methodFor(ruleId)`, which imports it on first use.
 *
 * Counts are parameters. The sizes of a rule's groups come from the counts and the inputs the rule reads (`ctx`),
 * and the size of the schools two rules both put in order is an argument of the strings that describe a comparison,
 * so no number is typed here and no group is called the same under every rule.
 */
import { allRecords, amongAllOrdered, completePhrase, countWord, orderedPhrase, type Reads } from "./counts";
import { formatCount, formatPercent, joinList, ordinal } from "./format";
import { IDEAS } from "./ideas";
import type { CopyRuleId, CountBag, PersistenceRule, PersistenceTest } from "./model";
import { sharedSize } from "./rank";
import { RULE_IDS, urgencyNote } from "./rules";
import { type Segments, nameSegment, seg, textOf } from "./segments";
import { STRINGS } from "./strings";
import { TERMS } from "./terms";

export interface MethodContext {
  /** The counts of the rule shown. */
  readonly counts?: CountBag;
  /** The inputs the rule shown reads. */
  readonly reads?: Reads;
  /** How each persistence test was drawn, by rule, from the data. Without it the words state no draws or settings. */
  readonly tests?: Partial<Record<PersistenceRule, PersistenceTest>>;
}

// "the 16 schools both rules put in order", or the same without a count.
const commonPhrase = (n?: number): string => {
  if (n === undefined || !Number.isInteger(n) || n === 0) return "the schools both rules put in order";
  if (n === 1) return "the one school both rules put in order";
  return `the ${formatCount(n)} schools both rules put in order`;
};
const bareLabel = (label: string): string => label.replace(/\s*\(\d+\)$/, "");
const lcFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// The labels under the places-moved ramp, from the same edges that sort a move into a bin: the top of the bins
// that are 1 to a, a + 1 to b, and more than b.
export const MOVE_EDGES: readonly [number, number] = Object.freeze([4, 14] as const);
const moveBinLabels = (edges: readonly [number, number] = MOVE_EDGES): string[] => {
  const [a, b] = edges;
  const bins = [`${b + 1}+`, `${a + 1} to ${b}`, `1 to ${a}`];
  return [...bins, "0", ...[...bins].reverse()];
};

// The denominator a rule's shares share when each is a whole number of it (12/19, 3/19 ...), or null.
const shareDenominator = (weights: Record<string, number | null | undefined>): number | null => {
  const values = Object.values(weights).filter((w): w is number => w != null);
  for (let d = 2; d <= 100; d += 1)
    if (values.every((w) => Math.abs(w * d - Math.round(w * d)) < 1e-9)) return d;
  return null;
};

/** The sheet's title with the rule's name marked, so the page can set it in italics without reading markup. */
const sheetTitle = (n: number, name: string): Segments => seg`First ${n}, ${nameSegment(name, "rule")}`;

/**
 * The persistence test in the research team's terms, for a rule it was run for. The draws, the threshold and the
 * settings come from the data (`test`); without them the words say the same without a number.
 */
// A concentration as the data gives it, with no rounding: 17.5 stays 17.5.
const plainNumber = (n: number): string => String(Number(n.toPrecision(12)));
// A test the words can state: a positive whole number of draws, a threshold above 0 and up to 1, and settings whose
// concentrations are all above 0. Anything else is missing, and the words state no number.
const usable = (test?: PersistenceTest): test is PersistenceTest =>
  !!test &&
  Number.isInteger(test.draws) &&
  test.draws > 0 &&
  test.threshold > 0 &&
  test.threshold <= 1 &&
  test.settings.length > 0 &&
  test.settings.every((s) => s.topLevel > 0 && s.schoolNeed > 0);

function persistentMethod(ruleId: PersistenceRule, test?: PersistenceTest): string {
  let how =
    "at least the paper's threshold share of the Dirichlet weight draws in each concentration setting";
  if (usable(test)) {
    const n = test.settings.length;
    const pairs = joinList(
      test.settings.map((s) => `${plainNumber(s.topLevel)}/${plainNumber(s.schoolNeed)}`)
    );
    const where =
      n === 1
        ? `the concentration setting (${pairs})`
        : `each of the ${countWord(n)} concentration settings (${pairs})`;
    how = `at least ${formatPercent(test.threshold)} of ${formatCount(test.draws)} Dirichlet weight draws in ${where}`;
  }
  return ruleId === "additive_no_u"
    ? `Persistent candidate: certain top-20 membership in ${how}, drawn fresh over the six components this rule uses. It is a revised sensitivity result, not an isolated estimate of what urgency changes.`
    : `Persistent candidate: certain top-20 membership in ${how} of the circulated, urgency-included experiment. The count belongs to that experiment and is not a result for the rule without urgency.`;
}

export function buildMethod(ctx: MethodContext = {}) {
  const c = ctx.counts || {};
  const reads = ctx.reads;
  const T = TERMS;
  const S = STRINGS;
  const among = (cA: CountBag | undefined, cB: CountBag | undefined): string =>
    sharedSize(cA, cB, "ranked")
      ? `among ${amongAllOrdered(cA)}`
      : "among all the schools that can be put in order under each rule";
  return Object.freeze({
    rule: Object.freeze({
      formula: "Formula",
      hideFormula: "Hide formula",
      primaryAria: "Main rule and urgency sensitivity",
      leaveCompare: "Back to the list",
    }),
    list: Object.freeze({
      toUpper: "Show the sensitivity check",
      toLower: "Back to the main order",
      range: "range",
      wasUnder: (b: string, s: string) => `was ${b} under ${s}`,
      noResultRow: "No result for this school under this rule",
      rankUnder: (s: string, r: number) => `${ordinal(r)} under ${s}`,
      noComparable: "No rank to compare",
      exactTitle: "Same rank in the list whatever the missing figure",
    }),
    // One phrase for the places that say a range school has one rank either way.
    sameEitherWay: "same either way",
    samePlaceUnder: (s: string) => `Same rank in the list under ${s}`,
    // A school with no result under a rule: the data given holds none, whatever the reason.
    noResultForSchool: "no result for this school",
    moved: Object.freeze({
      eyebrow: (name: string) => `${T.compare.label}: compared with ${name}`,
      clear: "Clear",
      up: "Up",
      down: "Down",
      range: "Range",
    }),
    queue: Object.freeze({
      all: "All",
      group: "Group",
      filterAria: "Show only schools missing this detail",
      groupAria: "Group the list",
      // The eyebrow of the chips that show only the schools lacking one part of school need.
      missingEyebrow: "Missing detail",
      // The parts' names for those chips: a chip shows records that lack the part however it is lacking (blank, 0,
      // negative, off the scale), so it names the part and not one cause.
      parts: Object.freeze({
        permanent_classroom_deficit: "Classroom count",
        teacher_housing_deficit: "Teacher or house count",
        facility_presence_deficit: "Facility counts",
        service_deficit: "Power or water source",
      }),
      // The method-only start of the line under the list head, when a filter hides some of the schools.
      showing: (shown: number, total: number) => `Showing ${shown} of ${total}.`,
    }),
    compare: Object.freeze({
      eyebrow: "Comparing two rules",
      swap: "Swap the two rules",
      pickPrimary: "Main rule and urgency sensitivity",
      pickAria: (slot: string) => `Choose the rule to compare ${slot}`,
      statementAria: "What changes between the two rules",
      enteringK: (k: number) => `Joins the top ${k}`,
      leavingK: (k: number) => `Leaves the top ${k}`,
      topK: "Top",
      kAria: "Rows shown in full",
      // The places in a comparison are the ranks among the schools both rules put in order, n of them.
      slopeMid: (n?: number) => `${T.rank.label}, among ${commonPhrase(n)}`,
      slopeBreak: (k: number, n?: number) =>
        n !== undefined && Number.isInteger(n) && n > k
          ? `Top ${k} above · ${k + 1} to ${n} compressed below`
          : `Top ${k} above · the rest compressed below`,
      slopeAria: "Ranks in the list under the two rules, joined by a line per school",
      rangesSub: (cA: CountBag | undefined = c, cB: CountBag | undefined = cA) => among(cA, cB),
      rangesNote: (k: number) => `${IDEAS.ranges.short} Shaded: the top ${k}.`,
      moveWords: (d: number, b: string) =>
        `${d < 0 ? "Up" : "Down"} ${Math.abs(d)} ${Math.abs(d) === 1 ? "rank" : "ranks"} under ${b}`,
      topBoth: (k: number) => `in the top ${k} under both methods`,
      topEnters: (k: number) => `joins the top ${k}`,
      topLeaves: (k: number) => `leaves the top ${k}`,
      legendTitle: (a: string, b: string) => `Places moved from ${a} to ${b}`,
      legendSub: (n: number | undefined, numerals?: number) =>
        `among ${commonPhrase(n)}${numerals === undefined ? "" : ` · numbers mark the first ${numerals}`}`,
      legendUp: "up",
      legendDown: "down",
      legendSize: (k: number, a: string, b: string) => `Larger dot: top ${k} under ${a} or ${b}`,
      // The one neutral colour of a school the two rules do not both put in order.
      legendOutside: "Not in the comparison",
      // The headings of the chart's accessible table.
      table: Object.freeze({
        school: "School",
        place: (rule: string) => `Place under ${rule}`,
        move: "Places moved",
      }),
      tipMove: (a: string, ra: string, b: string, rb: string, words: string) =>
        `${a}: <b>${ra}</b> → ${b}: <b>${rb}</b><br><span class="tip-x">${words}</span>`,
      tipRange: (
        a: string,
        ra: string,
        b: string,
        rb: string,
        cA: CountBag | undefined = c,
        cB: CountBag | undefined = cA
      ) =>
        `${a}: ${ra} → ${b}: ${rb}<br><span class="tip-x">${T.rank_range.label} ${among(cA, cB)}; no air-quality figure</span>`,
      sameTop: (a: string, b: string, k: number, n?: number) =>
        `Among ${commonPhrase(n)}, ${a} and ${b} put the same ${k} schools in their top ${k}.`,
      shareTop: (a: string, b: string, overlap: number, k: number, n?: number) =>
        `Among ${commonPhrase(n)}, ${a} and ${b} share ${overlap} of their top ${k} schools.`,
      suffixes: Object.freeze([
        [/\s+High School$/i, " HS"],
        [/\s+High Sch$/i, " HS"],
        [/\s+Secondary School$/i, " SS"],
        [/\s+Junior High$/i, " JH"],
      ] as const),
      // The edges that sort a move into its bin (1 to a, a + 1 to b, more than b), which the key's labels use too.
      moveEdges: MOVE_EDGES,
      moveBins: moveBinLabels,
    }),
    insp: Object.freeze({
      amongComplete: (s: string) => `under ${s}, among ${completePhrase(c, reads)}`,
      bestToWorst: (s: string) => `under ${s}, among ${orderedPhrase(c)}`,
      coincide: (s: string) => `under ${s}, among ${orderedPhrase(c)}, whatever the missing figure`,
      noResult: "no result",
      whyRange: "Why a range",
      noResultHero: "No result",
      noResultUnder: (s: string) => `under ${s}`,
      forSchool: "for this school",
      recordedInputs: "Recorded inputs",
      zeroToOne: "0 to 1",
      inputsUnder: (s: string) => `Inputs under ${s}`,
      valueZeroToOne: "value, 0 to 1",
      // The test behind the persistence flag, in the research team's own terms. Each rule the test ran for is its own
      // experiment, so each has its own words, and neither is read as the other's result.
      persistent: (ruleId: PersistenceRule) => persistentMethod(ruleId, ctx.tests?.[ruleId]),
      // The row for a largest-factor rule's extra share, named by the factor or factors that attain the largest value.
      largestRow: (factors: readonly string[]) =>
        factors.length
          ? `Extra share for the largest factor: ${joinList(factors.map(lcFirst))}`
          : "Extra share for the largest factor",
      noSplit:
        "The research team records what each input adds for the two combined-factors rules only, so this rule shows input values.",
      produces: `What adds to the ${lcFirst(T.score.label)}`,
      recordedSplit: "as recorded",
      inputAndWeight: "Input and its share",
      value: "Value",
      adds: "Adds",
      topReason: "One of the things that add most",
      trackNote: (s: string) =>
        `Each bar's grey track is the most that input can add under ${s}. ${S.separateMeasures}`,
      addsBetween: (lo: string, hi: string) => `Adds between ${lo} and ${hi}`,
      across: (ruleCount: number = RULE_IDS.length) => `Across the ${countWord(ruleCount)} rules`,
      // Each rule counts its own group, so the headings name no group size.
      rankOf: "rank in the list",
      rangeOf: "possible ranks",
      evidence: "Record",
      schoolId: "School id",
      cond: Object.freeze({
        classrooms_permanent: "Permanent classrooms",
        classrooms_semi_permanent: "Semi-permanent classrooms",
        classrooms_bush: "Bush classrooms",
        classrooms_total: "Classrooms in total",
        teachers: "Teachers",
        teacher_houses: "Teacher houses",
        water_source: "Water source",
        power_source: "Power source",
        toilets: "Toilets",
      }),
      bothRules: "Under both rules",
      component: "Input",
      noSplitCell: "no split",
      notUsed: "left out",
      bothNote: `What each input adds is recorded for the two combined-factors rules; other rules record no split. ${S.separateMeasures}`,
      noSplitBoth: (rules: string) => `No split is recorded for ${rules}.`,
      times: (share: string) => `× ${share}`,
      partRecorded: (part: string) => `${part}: recorded`,
    }),
    legend: Object.freeze({
      title: (label: string) => `${T.rank.label} under ${label}`,
      sub: (numerals: number) => `among ${completePhrase(c, reads)} · numbers mark the first ${numerals}`,
      rangeNone: "Possible ranks not computed",
    }),
    layers: Object.freeze({
      find: "Find a layer",
      none: "No layer matches.",
      groups: Object.freeze({ Schools: "Schools", Boundaries: "Boundaries" }),
      items: Object.freeze({
        ranked: "Schools that can be put in order, by rank in the list or move",
        numerals: (n: number) => `Numbers on the first ${n}`,
        range: `Schools with ${lcFirst(bareLabel(T.rank_range.label))}`,
        provinces: "Provinces",
        districts: "Districts",
      }),
    }),
    filter: Object.freeze({
      allProvinces: "All provinces",
      allLocalities: "Any remoteness",
      chipProvince: (v: string) => `Province: ${v}`,
      chipLocality: (v: string) => `${T.need_locality.label}: ${v}`,
      chipsAria: "Active filters",
      remove: (t: string) => `Remove ${t} filter`,
    }),
    sheet: Object.freeze({
      title: (n: number, name: string) => textOf(sheetTitle(n, name)),
      lede: (n: number, name: string, has124: boolean) =>
        `The first ${n} ranks in the list among ${completePhrase(c, reads)} under ${name}${has124 ? `, then the schools whose possible ranks reach the top ${n}` : ""}. ${T.export.line}`,
      ledeCompare: (name: string) => ` The workspace is comparing it with ${name}.`,
      formula: "Formula",
      weights: "Shares",
      urgency: "Urgency",
      noWeights: "Not declared for this rule",
      filtersOff: "None. Every school that can be put in order is listed.",
      school: "School",
      rangeH: "Possible ranks",
      missingH: "Missing",
      noneTop: (n: number) => `No school in the first ${n} matches the filters.`,
      possible: (n: number) => `Possible ranks that reach the top ${n}`,
      possibleNone: (n: number) => `No school with possible ranks can reach the top ${n} under this rule.`,
      possibleNoResult: "This rule has no result for the schools that show a range.",
      pointRanks: "Ranks in the list",
      normalization: "Scaling",
      normalizationV: (all?: number) =>
        `Rescaled against ${allRecords(all === undefined ? undefined : { all })}, fixed. Worked out by the engine at download.`,
      fixture: "Data generated",
      limits: "Limits",
      limitsV: `${S.caveat} The project's own checks are not an outside reproduction.`,
      savedViewsLede:
        "Your saved views for meetings are listed in order with the rule of each, so another person can replay the meeting from the links.",
      viewsH: "Saved views, in order",
      stop: "Saved view",
      shows: "Shows",
      // What a saved view opens on: the list in order, or the incomplete records and how they are grouped.
      showsRanked: "Schools in order",
      showsQueue: (grouping: "province" | "evidence") =>
        `Missing information, grouped by ${grouping === "evidence" ? "what is missing" : "province"}`,
      showsMethod: "method details on",
      showsCompare: (a: string, b: string) => `Comparing ${a} with ${b}`,
      comparedWith: (s: string) => `compared with ${s}`,
      contents: "Contents",
      links: "Links",
      linksV: "One link per saved view that reopens it",
      shortlistV: "The top list and its method record for the rule of each saved view",
      generatedAt: (date: string) => `${date} UTC`,
    }),
    manifest: Object.freeze({
      head: `RISE-PNG ${lcFirst(T.screening.label)}, ${lcFirst(T.shortlist.label)}`,
      rule: (short: string, id: string, label: string) => `Rule: ${short} (${id}), ${label}`,
      role: (v: string) => `Role: ${v}`,
      formula: (v: string) => `Formula: ${v}`,
      weights: (v: string) => `Shares: ${v}`,
      noWeights: "not declared for this rule",
      urgency: (id: CopyRuleId) => `Urgency: ${urgencyNote(id)}`,
      shortlist: (n: number) =>
        `${T.shortlist.label}: first ${n} ranks in the list among ${completePhrase(c, reads)}`,
      ranges: (has124: boolean) =>
        `Possible positions: ${among(c, c)}, ${has124 ? "listed separately" : "no result for this rule"}`,
      filters: (v: string) => `Display filters: ${v || "none"}`,
      filterProvince: (v: string) => `province ${v}`,
      filterLocality: (v: string) => `remoteness ${v}`,
      unchanged: " (ranks unchanged)",
      compared: (short: string, id: string) => `Compared in the workspace with: ${short} (${id})`,
      normalization: (all?: number) =>
        `Scaling: rescaled against ${allRecords(all === undefined ? undefined : { all })}, fixed; worked out by the engine at download`,
      fixture: (v: string) => `Data generated: ${v}`,
      input: (f: string, h: string) => `Input ${f}: sha256 ${h}`,
    }),
    // A share written as a fraction of the whole number its rule's shares add to (12/19), not a typed 19.
    shareFraction: (n: number, total: number) => `${n}/${total}`,
    shareDenominator,
    /** Sentences that name something, as segments; `textOf` of one is the string of the same name above. */
    segments: Object.freeze({
      sheetTitle: (n: number, name: string) => sheetTitle(n, name),
    }),
  });
}
export const METHOD = buildMethod();
export type Method = ReturnType<typeof buildMethod>;
