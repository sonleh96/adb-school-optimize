/**
 * Where a school sits: its position or range of positions, the large figure on its card, ties, and how a school's name
 * and location read when the record leaves them blank.
 */
import {
  amongAllOrdered,
  completePhrase,
  countWord,
  countsFrom,
  everyInput,
  known,
  orderedPhrase,
  oneRange,
  rangePhrase,
  type Reads,
} from "./counts";
import { capitalise, cleanedOrNull, displayName, formatCount, joinList, ordinal, plural } from "./format";
import type {
  CopyResult,
  CopyRuleId,
  CopySchool,
  CountBag,
  CountsByRule,
  CountsByRuleArg,
  NamedSchool,
  PlacedSchool,
} from "./model";
import { nameList, nameSegment, seg, joinSegments, textOf, type Segments } from "./segments";
import { rule, ruleReads } from "./rules";
import { STRINGS, persistentNearLine } from "./strings";
import { LAYOUT } from "./words";

/* ------------------------------------------------------ fixture helpers */

export const resultFor = (school: Pick<PlacedSchool, "results">, ruleId: CopyRuleId): CopyResult | null =>
  (school.results ? school.results[ruleId] : null) || null;
export const isNeedFirst = (ruleId: CopyRuleId): boolean =>
  ruleId === "need_first_u" || ruleId === "need_first_no_u";

type WithBounds = CopyResult & { rank_best: number; rank_worst: number };
type WithPlace = CopyResult & { rank_complete120: number };
export const hasBounds = (r: CopyResult | null | undefined): r is WithBounds =>
  !!r && Number.isInteger(r.rank_best) && Number.isInteger(r.rank_worst);
export const hasPlace = (r: CopyResult | null | undefined): r is WithPlace =>
  !!r && Number.isInteger(r.rank_complete120);

/** The group sizes of the run that gave `ruleId` its positions: that rule's own when known, otherwise `opts.counts`. */
export const perRule = (opts: { countsByRule?: CountsByRuleArg }): opts is { countsByRule: CountsByRule } =>
  !!opts.countsByRule && opts.countsByRule !== "shared";
export const countsOf = (
  opts: { counts?: CountBag; countsByRule?: CountsByRuleArg },
  ruleId: CopyRuleId
): CountBag | undefined => (perRule(opts) ? opts.countsByRule[ruleId] : opts.counts);
/**
 * True when two rules count a group the same size. When the sizes are not both known they are the same only if
 * nothing says they differ (`strict` is false): one run's counts shared by every rule.
 */
export const sharedSize = (
  a: CountBag | undefined,
  b: CountBag | undefined,
  k: string,
  strict = false
): boolean => (known(a, k) && known(b, k) ? a[k] === b[k] : !strict && a === b);

export interface PlaceOpts {
  /** Start the sentence with the school's name. */
  name?: boolean;
  /** A top-list length such as 20, which adds whether a range school is inside it either way. */
  shortlist?: number;
  /** Add what counting the range schools could do. Method details only. */
  method?: boolean;
  /** From `countsFrom`. */
  counts?: CountBag;
  /** The group sizes of each rule's own run, when they differ from `counts`. */
  countsByRule?: CountsByRuleArg;
  /** The schools of the list, so a name is told apart from a twin's. */
  schools?: readonly NamedSchool[];
}

/* ------------------------------------------------------- rank sentences */

// Which environment readings a school lacks, in reading order.
export type Reading = "aqi" | "emissions" | "land";
const READING_NAMES: Record<Reading, string> = {
  aqi: "air-quality reading",
  emissions: "nearby emissions figure",
  land: "land-cover figure",
};
export function missingReadings(school: Pick<PlacedSchool, "missing_env" | "raw">): Reading[] {
  const m = school.missing_env || { aqi: false, emissions: false, land: false };
  const raw = school.raw || {};
  const out: Reading[] = [];
  if (m.aqi || raw.Q_raw === null) out.push("aqi");
  if (m.emissions || raw.E_raw === null) out.push("emissions");
  if (m.land || raw.L_raw === null) out.push("land");
  return out;
}
// "Its air-quality reading, an air-pollution index for its location, is missing" or
// "Its air-quality reading, nearby emissions figure and land-cover figure are not recorded".
export function missingReadingsClause(school: Pick<PlacedSchool, "missing_env" | "raw">): string {
  const keys = missingReadings(school);
  if (keys.length === 0) return "One of its readings is missing";
  if (keys.length === 1 && keys[0] === "aqi")
    return "Its air-quality reading, an air-pollution index for its location, is missing";
  if (keys.length === 1) return `Its ${READING_NAMES[keys[0]]} is not recorded`;
  return `Its ${joinList(keys.map((k) => READING_NAMES[k]))} are not recorded`;
}
const shortMissing = (school: Pick<PlacedSchool, "missing_env" | "raw">): string => {
  const keys = missingReadings(school);
  if (keys.length === 1 && keys[0] === "aqi") return "Its air-quality reading is missing";
  return missingReadingsClause(school);
};

// The clause for a school with every input recorded, when counting the range schools changes its position.
function rangeCountClause(res: CopyResult | null, c: CountBag | undefined): string {
  if (!hasBounds(res) || res.rank_bounds_scope !== "eligible124") return "";
  const r = res.rank_complete120;
  if (res.rank_best === r && res.rank_worst === r) return "";
  const where =
    res.rank_best === res.rank_worst
      ? ordinal(res.rank_best)
      : res.rank_worst === res.rank_best + 1
        ? `${ordinal(res.rank_best)} or ${ordinal(res.rank_worst)}`
        : `anywhere from ${ordinal(res.rank_best)} to ${ordinal(res.rank_worst)}`;
  return `, and ${where} once ${rangePhrase(c)} ${oneRange(c) ? "is" : "are"} counted`;
}

function shortlistClause(res: WithBounds, k: number | undefined): string {
  if (!Number.isInteger(k)) return "";
  if (res.rank_worst <= (k as number)) return ` It is in the top ${k} either way.`;
  if (res.rank_best > (k as number)) return ` It is outside the top ${k} either way.`;
  return ` It may or may not be in the top ${k}, depending on the missing reading.`;
}

// opts.name: start with the school's name. opts.shortlist: a top-list length such as 20,
// which adds whether a range school is inside it either way. opts.counts: from countsFrom.
export function rankSegments(school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): Segments {
  const r = rule(ruleId);
  const c = countsOf(opts, ruleId);
  const nm = opts.name ? nameSegment(distinctName(school, opts.schools)) : null;
  if (school.cohort === "queue") {
    const rest =
      "be put in order yet. Information about it is missing, so it is not in the list until the missing details are checked. That says nothing about its need.";
    return nm ? seg`${nm} cannot ${rest}` : seg`Cannot ${rest}`;
  }
  const res = resultFor(school, ruleId);
  if (school.cohort === "interval") {
    if (!res || !hasBounds(res)) return noResult(nm, r.name);
    if (res.rank_best === res.rank_worst) {
      const first = nm ? seg`${nm} is ${ordinal(res.rank_best)}` : seg`${capitalise(ordinal(res.rank_best))}`;
      return seg`${first} of ${orderedPhrase(c)}. ${shortMissing(school)}, but under this rule that cannot change its position in the list.${shortlistClause(res, opts.shortlist)}`;
    }
    const first = nm ? seg`${nm} could be anywhere` : seg`Anywhere`;
    return seg`${first} from ${ordinal(res.rank_best)} to ${ordinal(res.rank_worst)} of ${orderedPhrase(c)}. ${missingReadingsClause(school)}, so the screen shows the highest and lowest positions in the list it could take.${shortlistClause(res, opts.shortlist)}`;
  }
  if (!hasPlace(res)) {
    return noResult(nm, r.name);
  }
  const head = nm
    ? seg`${nm} is ${ordinal(res.rank_complete120)}`
    : seg`${capitalise(ordinal(res.rank_complete120))}`;
  return seg`${head} of ${completePhrase(c, ruleReads(ruleId))}${rangeCountClause(res, c)}.`;
}
export const rankSentence = (school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): string =>
  textOf(rankSegments(school, ruleId, opts));

// A school with no result under a rule in the data given. The engine computes every rule for every school, so this
// means the rule's list is not in the data, not that the rule was skipped; the words claim nothing more.
const noResult = (nm: Segments[number] | null, ruleName: string): Segments =>
  nm ? seg`${nm} has no result under ${ruleName}.` : seg`No result under ${ruleName}.`;

// The card's large figure: "3rd", "12th to 18th", "5th of 40", or a status. placeContext never restates it.
// A range school's figure always carries its range or its scope, so it never reads like a single position among the others.
export function placeHeadline(
  school: PlacedSchool,
  ruleId: CopyRuleId,
  opts: Pick<PlaceOpts, "counts" | "countsByRule"> = {}
): string {
  rule(ruleId);
  const c = countsOf(opts, ruleId);
  if (school.cohort === "queue") return STRINGS.notPlaced;
  const res = resultFor(school, ruleId);
  if (school.cohort === "interval") {
    if (!hasBounds(res)) return STRINGS.noResult;
    if (res.rank_best !== res.rank_worst) return `${ordinal(res.rank_best)} to ${ordinal(res.rank_worst)}`;
    return known(c, "ranked") && c.ranked > 0
      ? `${ordinal(res.rank_best)} of ${formatCount(c.ranked)}`
      : `${ordinal(res.rank_best)} of all in order`;
  }
  return hasPlace(res) ? ordinal(res.rank_complete120) : STRINGS.noResult;
}

// True when a list shows single positions and ranges together. A bare place counts the schools with every input
// recorded and a range counts all the schools that can be put in order, so the two numbers mean different things.
export function scopesMix(list: readonly PlacedSchool[], ruleId: CopyRuleId): boolean {
  rule(ruleId);
  return (
    list.some((s) => s.cohort === "complete" && hasPlace(resultFor(s, ruleId))) &&
    list.some((s) => s.cohort === "interval" && hasBounds(resultFor(s, ruleId)))
  );
}

// A list row's figure: the card's figure, with the group a range counts added when the list also shows single
// places ("5th to 6th of 87"). A range never sits beside a bare place that counts a different group.
export function rowPlace(
  school: PlacedSchool,
  ruleId: CopyRuleId,
  list: readonly PlacedSchool[],
  opts: Pick<PlaceOpts, "counts" | "countsByRule"> = {}
): string {
  const head = placeHeadline(school, ruleId, opts);
  const res = resultFor(school, ruleId);
  if (school.cohort !== "interval" || !hasBounds(res) || res.rank_best === res.rank_worst) return head;
  if (!scopesMix(list, ruleId)) return head;
  const c = countsOf(opts, ruleId);
  return `${head} of ${known(c, "ranked") && c.ranked > 0 ? formatCount(c.ranked) : "all in order"}`;
}

// What the large figure counts among. Plain views give one position only; opts.method adds
// what counting the range schools could do. opts.shortlist as in rankSentence. opts.counts: from countsFrom.
export function placeContext(school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): string {
  const r = rule(ruleId);
  const c = countsOf(opts, ruleId);
  if (school.cohort === "queue")
    return "Information about it is missing, so it is not in the list until the missing details are checked. That says nothing about its need.";
  const res = resultFor(school, ruleId);
  if (school.cohort === "interval") {
    if (!hasBounds(res)) return `${capitalise(r.name)} has no result for this school.`;
    if (res.rank_best === res.rank_worst)
      return `Among ${orderedPhrase(c)}. ${shortMissing(school)}, but under this rule that cannot change its position in the list.${shortlistClause(res, opts.shortlist)}`;
    return `Possible positions among ${orderedPhrase(c)}. ${missingReadingsClause(school)}, so the screen shows the highest and lowest positions in the list it could take.${shortlistClause(res, opts.shortlist)}`;
  }
  if (!hasPlace(res)) return `${capitalise(r.name)} has no result for this school.`;
  const head = `Among ${completePhrase(c, ruleReads(ruleId))}.`;
  if (!opts.method || !rangeCountClause(res, c)) return head;
  // rangeCountClause is non-empty only when the bounds exist.
  const bounds = res as WithBounds;
  const where =
    bounds.rank_best === bounds.rank_worst
      ? `it would be ${ordinal(bounds.rank_best)}`
      : bounds.rank_worst === bounds.rank_best + 1
        ? `it could be ${ordinal(bounds.rank_best)} or ${ordinal(bounds.rank_worst)}`
        : `it could be anywhere from ${ordinal(bounds.rank_best)} to ${ordinal(bounds.rank_worst)}`;
  return `${head} Counting ${rangePhrase(c)}, ${where}.`;
}

// Detail view only: what counting the range schools does to a school with every input recorded.
// rankSentence already carries this in one sentence, so do not show both.
export function fullRankingSentence(school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): string {
  const c = countsOf(opts, ruleId);
  if (school.cohort !== "complete") return rankSentence(school, ruleId, opts);
  const res = resultFor(school, ruleId);
  if (!hasBounds(res) || res.rank_bounds_scope !== "eligible124") {
    return `This rule was not run on ${amongAllOrdered(c)}, so only its position in the list among ${completePhrase(c, ruleReads(ruleId))} is available.`;
  }
  if (!rangeCountClause(res, c))
    return `Counting ${rangePhrase(c)} does not change its position in the list.`;
  const where =
    res.rank_best === res.rank_worst
      ? ordinal(res.rank_best)
      : `between ${ordinal(res.rank_best)} and ${ordinal(res.rank_worst)}`;
  return `Once ${rangePhrase(c)} ${oneRange(c) ? "is" : "are"} counted, it would sit ${where} of ${amongAllOrdered(c)}.`;
}

type Standing =
  | { readonly kind: "point"; readonly place: number }
  | { readonly kind: "range"; readonly best: number; readonly worst: number }
  | { readonly kind: "none" };

// How a school stands under one rule: one position, a range of positions (or a range whose ends meet), or none.
// A school with a range under the rule shown reads its range first; any other school reads its position first.
function standing(school: PlacedSchool, res: CopyResult | null): Standing {
  const point: Standing | null = hasPlace(res) ? { kind: "point", place: res.rank_complete120 } : null;
  const range: Standing | null = hasBounds(res)
    ? { kind: "range", best: res.rank_best, worst: res.rank_worst }
    : null;
  return (school.cohort === "interval" ? (range ?? point) : (point ?? range)) ?? { kind: "none" };
}

// One school under two rules: a range school's possible positions, or a single position for the others.
// Each place is said against the group of the rule that gave it, because the groups differ between rules.
export function rangeComparisonSegments(
  school: PlacedSchool,
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  opts: Pick<PlaceOpts, "counts" | "countsByRule" | "schools"> = {}
): Segments {
  const a = rule(ruleA),
    b = rule(ruleB);
  const cA = countsOf(opts, ruleA),
    cB = countsOf(opts, ruleB);
  const nm = nameSegment(distinctName(school, opts.schools));
  const sa = standing(school, resultFor(school, ruleA)),
    sb = standing(school, resultFor(school, ruleB));
  const held = school.cohort === "queue";
  if (sa.kind === "none" && sb.kind === "none") {
    return held
      ? seg`${nm} cannot be put in order under ${a.name} or ${b.name} yet, because information about it is missing.`
      : seg`${nm} has no result under ${a.name} or ${b.name}.`;
  }
  if (sa.kind === "point" && sb.kind === "point") {
    if (sharedSize(cA, cB, "complete", perRule(opts)))
      return seg`Among ${completePhrase(cA, ruleReads(ruleA))}, ${nm} is ${ordinal(sa.place)} under ${a.name} and ${ordinal(sb.place)} under ${b.name}.`;
    return seg`Under ${a.name}, ${nm} is ${ordinal(sa.place)} among ${completePhrase(cA, ruleReads(ruleA))}. Under ${b.name}, it is ${ordinal(sb.place)} among ${completePhrase(cB, ruleReads(ruleB))}.`;
  }
  const where = (st: Standing & { kind: "range" }, rr: { name: string }): string =>
    st.best === st.worst
      ? `${ordinal(st.best)} under ${rr.name}`
      : `anywhere from ${ordinal(st.best)} to ${ordinal(st.worst)} under ${rr.name}`;
  if (
    school.cohort === "interval" &&
    sa.kind !== "point" &&
    sb.kind !== "point" &&
    sharedSize(cA, cB, "ranked", perRule(opts))
  ) {
    const among = `Among ${orderedPhrase(cA)}`;
    if (sa.kind === "none" && sb.kind === "range")
      return seg`${among}, ${nm} sits ${where(sb, b)}. It has no result under ${a.name}.`;
    if (sb.kind === "none" && sa.kind === "range")
      return seg`${among}, ${nm} sits ${where(sa, a)}. It has no result under ${b.name}.`;
    if (sa.kind === "range" && sb.kind === "range")
      return seg`${among}, ${nm} sits ${where(sa, a)}, and ${where(sb, b)}.`;
  }
  // Each side on its own, with its own group. The first side names the school; the second says "it".
  const clause = (
    st: Standing,
    rr: { name: string },
    c: CountBag | undefined,
    reads: Reads,
    first: boolean
  ): Segments => {
    const subject: Segments = first ? [nm] : ["it"];
    if (st.kind === "point")
      return seg`Under ${rr.name}, ${subject} is ${ordinal(st.place)} among ${completePhrase(c, reads)}.`;
    if (st.kind === "range")
      return st.best === st.worst
        ? seg`Under ${rr.name}, ${subject} is ${ordinal(st.best)} among ${orderedPhrase(c)}.`
        : seg`Under ${rr.name}, ${subject} could be anywhere from ${ordinal(st.best)} to ${ordinal(st.worst)} among ${orderedPhrase(c)}.`;
    return held
      ? seg`It cannot be put in order under ${rr.name} yet, because information about it is missing.`
      : seg`It has no result under ${rr.name}.`;
  };
  const sides: [Standing, { name: string }, CountBag | undefined, Reads][] = [
    [sa, a, cA, ruleReads(ruleA)],
    [sb, b, cB, ruleReads(ruleB)],
  ];
  if (sa.kind === "none") sides.reverse();
  return joinSegments(sides.map(([st, rr, c, reads], i) => clause(st, rr, c, reads, i === 0)));
}
export const rangeComparisonSentence = (
  school: PlacedSchool,
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  opts: Pick<PlaceOpts, "counts" | "countsByRule"> = {}
): string => textOf(rangeComparisonSegments(school, ruleA, ruleB, opts));

// Question 1: which schools a rule puts first. schools: the full schools array; counts come from it.
export function listStartsSegments(schools: readonly PlacedSchool[], ruleId: CopyRuleId, n = 3): Segments {
  const r = rule(ruleId);
  const c = countsFrom(schools);
  const firsts = schools
    .flatMap((s) => {
      const res = resultFor(s, ruleId);
      return s.cohort === "complete" && hasPlace(res) ? [{ s, place: res.rank_complete120 }] : [];
    })
    .sort((x, y) => x.place - y.place)
    .slice(0, n)
    .map((x) => x.s);
  if (firsts.length === 0)
    return seg`Under ${r.name}, no school has ${everyInput(ruleReads(ruleId))}, so the list has no single positions yet.`;
  const k = firsts.length;
  const ranges = schools.filter((s) => {
    const res = resultFor(s, ruleId);
    return s.cohort === "interval" && hasBounds(res) && res.rank_best <= k;
  });
  const names = nameList(firsts.map((s) => distinctName(s, schools)));
  const sentence =
    k === 1
      ? seg`Under ${r.name}, the first of ${completePhrase(c, ruleReads(ruleId))} is ${names}.`
      : seg`Under ${r.name}, the first ${countWord(k)} of ${completePhrase(c, ruleReads(ruleId))} are ${names}.`;
  if (!ranges.length) return sentence;
  return seg`${sentence} ${nameList(ranges.map((s) => distinctName(s, schools)))} could also be among the first ${countWord(k)}, because ${plural(ranges.length, "it shows", "they show")} a range.`;
}
export const listStartsSentence = (schools: readonly PlacedSchool[], ruleId: CopyRuleId, n = 3): string =>
  textOf(listStartsSegments(schools, ruleId, n));

/* ------------------------------------------------- names, places and ties */

// Where a school is, with a plain phrase for a blank district or province.
export function locationLine(school: NamedSchool): string {
  const d = cleanedOrNull(school.district);
  const p = cleanedOrNull(school.province);
  if (d && p) return `${d}, ${p}`;
  if (p) return `District not recorded, ${p}`;
  if (d) return `${d}, province not recorded`;
  return "Location not recorded";
}

// A province as the list shows it after a school's name, so a reader knows what kind of place it is: the word
// province is added unless the name already says what it is. Null when the record leaves it blank.
export function provinceLabel(province: string | null | undefined): string | null {
  const p = cleanedOrNull(province ?? null);
  if (!p) return null;
  return /\b(province|district|region)\b/i.test(p) ? p : `${p} province`;
}

// The heading of a province group in the list of incomplete records. A blank province is its own group.
export const provinceHeading = (province: string | null | undefined): string =>
  cleanedOrNull(province ?? null) ?? LAYOUT.provinceNotRecorded;

// The schools of a list by the name they display, built once per list so naming each school stays cheap. Only a
// frozen list is kept, because a list that can change in place would leave the index out of date; the bound copy
// binds a frozen snapshot of its schools. Any other list is indexed afresh on each call.
const NAME_INDEX = new WeakMap<readonly NamedSchool[], Map<string, NamedSchool[]>>();
function byDisplayName(schools: readonly NamedSchool[]): Map<string, NamedSchool[]> {
  const kept = Object.isFrozen(schools);
  let index = kept ? NAME_INDEX.get(schools) : undefined;
  if (!index) {
    index = new Map();
    for (const x of schools) {
      const name = displayName(x);
      const same = index.get(name);
      if (same) same.push(x);
      else index.set(name, [x]);
    }
    if (kept) NAME_INDEX.set(schools, index);
  }
  return index;
}

// A display name that tells apart two schools whose names differ only in spacing.
// schools: the full schools array. Joins and exports keep the original string and the id.
export function distinctName(school: NamedSchool, schools: readonly NamedSchool[] = []): string {
  const name = displayName(school);
  const twins = (byDisplayName(schools).get(name) ?? []).filter((x) => x.id !== school.id);
  if (!twins.length) return name;
  const district = cleanedOrNull(school.district);
  if (district && twins.every((x) => cleanedOrNull(x.district) !== district)) return `${name} (${district})`;
  return `${name} (record ${school.id})`;
}

// A tie note for the card or the row, or null when the school is level with no other.
// Ties are exact, as the engine compares them: the same score, or under need-first the same school need.
export function tieNoteSegments(
  school: PlacedSchool,
  ruleId: CopyRuleId,
  schools: readonly PlacedSchool[] = [],
  form: "card" | "row" = "card"
): Segments | null {
  rule(ruleId);
  if (school.cohort !== "complete") return null;
  const nf = isNeedFirst(ruleId);
  const value = (s: PlacedSchool): number | null => {
    const r = resultFor(s, ruleId);
    return r ? ((nf ? r.school_need : r.score_point) ?? null) : null;
  };
  const second = (s: PlacedSchool): number | null => {
    const r = resultFor(s, ruleId);
    return r ? (r.secondary_score_lower ?? null) : null;
  };
  const mine = value(school);
  if (mine == null) return null;
  const level = schools.filter((x) => {
    const v = value(x);
    return x.id !== school.id && x.cohort === "complete" && v != null && v === mine;
  });
  if (!level.length) return null;
  const names = nameList(level.map((x) => distinctName(x, schools)));
  const sameName = level.some((x) => displayName(x) === displayName(school));
  const nameRule = sameName ? "by the name as recorded, which differs only in spacing" : "by school name";
  if (nf) {
    const mineSecond = second(school);
    const exact = level.filter((x) => {
      const s2 = second(x);
      return s2 != null && mineSecond != null && s2 === mineSecond;
    });
    if (form === "row") return seg`Same school need as ${names}`;
    return exact.length === level.length
      ? seg`It has exactly the same school need and other inputs as ${names}, so the order goes ${nameRule}.`
      : seg`It has exactly the same school need as ${names}, so the other inputs decide which comes first.`;
  }
  if (form === "row") return seg`Level with ${names}`;
  return seg`It has exactly the same score as ${names}, so the order goes ${nameRule}.`;
}
export function tieNote(
  school: PlacedSchool,
  ruleId: CopyRuleId,
  schools: readonly PlacedSchool[] = [],
  form: "card" | "row" = "card"
): string | null {
  const s = tieNoteSegments(school, ruleId, schools, form);
  return s === null ? null : textOf(s);
}

/* ------------------------------------------------------ the persistence flag */

/**
 * What to say about the persistence flag of a school, under a rule the stochastic test ran for. Each such rule has
 * its own test and its own flag, so the flag is said only under the rule it belongs to and in that rule's words;
 * a rule with no test in the data, or a school the data does not flag under the rule, says nothing. A flagged school
 * whose lowest frequency is only just above the line also says that another run could change it, with the size of
 * that margin when known. Under a rule where the data flags no school as adjacent, that sentence never appears.
 * `opts.margin`: how far above the line counts as just above, as a fraction (`marginFromResults`), from that rule's
 * list's provenance block.
 */
export function persistenceNote(
  school: Pick<CopySchool, "persistence">,
  ruleId: CopyRuleId,
  opts: { margin?: number } = {}
): string[] {
  rule(ruleId);
  if (ruleId !== "additive_u" && ruleId !== "additive_no_u") return [];
  const flag = school.persistence?.[ruleId];
  if (!flag?.persistent) return [];
  const out: string[] = [STRINGS.persistentFlag[ruleId]];
  if (flag.adjacent) out.push(persistentNearLine(opts.margin));
  return out;
}
