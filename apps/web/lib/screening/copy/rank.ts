/**
 * Where a school sits: its place or range of places, the large figure on its card, ties, and how a school's name
 * and location read when the record leaves them blank.
 */
import {
  amongAllOrdered,
  completePhrase,
  countWord,
  countsFrom,
  known,
  orderedPhrase,
  rangePhrase,
} from "./counts";
import { capitalise, cleanedOrNull, displayName, formatCount, joinList, ordinal, plural } from "./format";
import type { CopyResult, CopyRuleId, CountBag, CountsByRule, NamedSchool, PlacedSchool } from "./model";
import { rule } from "./rules";
import { STRINGS } from "./strings";

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

/** The group sizes of the run that gave `ruleId` its places: that rule's own when known, otherwise `opts.counts`. */
export const countsOf = (
  opts: { counts?: CountBag; countsByRule?: CountsByRule },
  ruleId: CopyRuleId
): CountBag | undefined => opts.countsByRule?.[ruleId] ?? opts.counts;
/** True when two rules count a group the same size, or nothing says they differ. */
export const sharedSize = (a: CountBag | undefined, b: CountBag | undefined, k: string): boolean =>
  a === b || (known(a, k) && known(b, k) && a[k] === b[k]);

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
  countsByRule?: CountsByRule;
}

/* ------------------------------------------------------- rank sentences */

// Which environment readings a school lacks, in reading order.
type Reading = "aqi" | "emissions" | "land";
const READING_NAMES: Record<Reading, string> = {
  aqi: "air-quality reading",
  emissions: "nearby emissions figure",
  land: "land-cover figure",
};
function missingReadings(school: Pick<PlacedSchool, "missing_env" | "raw">): Reading[] {
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

// The clause for a school with every input recorded, when counting the range schools changes its place.
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
  return `, and ${where} once ${rangePhrase(c)} are counted`;
}

function shortlistClause(res: WithBounds, k: number | undefined): string {
  if (!Number.isInteger(k)) return "";
  if (res.rank_worst <= (k as number)) return ` It is in the top ${k} either way.`;
  if (res.rank_best > (k as number)) return ` It is outside the top ${k} either way.`;
  return ` It may or may not be in the top ${k}, depending on the missing reading.`;
}

// opts.name: start with the school's name. opts.shortlist: a top-list length such as 20,
// which adds whether a range school is inside it either way. opts.counts: from countsFrom.
export function rankSentence(school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): string {
  const r = rule(ruleId);
  const c = countsOf(opts, ruleId);
  const lead = opts.name ? `${displayName(school)} is` : "It is";
  if (school.cohort === "queue") {
    return `${opts.name ? `${displayName(school)} cannot` : "Cannot"} be put in order yet. Its record is incomplete, so it has no place in the list until the missing details are checked. That says nothing about its need.`;
  }
  const res = resultFor(school, ruleId);
  if (school.cohort === "interval") {
    if (!res || !hasBounds(res)) {
      return `${opts.name ? `${displayName(school)} is not` : "Not"} computed under ${r.name}. That rule was only run on ${completePhrase(c)}, and this school has a missing reading.`;
    }
    if (res.rank_best === res.rank_worst) {
      const first = opts.name
        ? `${displayName(school)} is ${ordinal(res.rank_best)}`
        : capitalise(ordinal(res.rank_best));
      return `${first} of ${orderedPhrase(c)}. ${shortMissing(school)}, but under this rule that cannot change its place in the list.${shortlistClause(res, opts.shortlist)}`;
    }
    const first = opts.name ? `${displayName(school)} could be anywhere` : "Anywhere";
    return `${first} from ${ordinal(res.rank_best)} to ${ordinal(res.rank_worst)} of ${orderedPhrase(c)}. ${missingReadingsClause(school)}, so the screen shows the highest and lowest places in the list it could take.${shortlistClause(res, opts.shortlist)}`;
  }
  if (!hasPlace(res)) {
    return `${opts.name ? `${displayName(school)} is not` : "Not"} computed under ${r.name}.`;
  }
  const head = opts.name
    ? `${lead} ${ordinal(res.rank_complete120)}`
    : capitalise(ordinal(res.rank_complete120));
  return `${head} of ${completePhrase(c)}${rangeCountClause(res, c)}.`;
}

// The card's large figure: "3rd", "12th to 18th", "5th of 40", or a status. placeContext never restates it.
// A range school's figure always carries its range or its scope, so it never reads like a single place among the others.
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
    if (!hasBounds(res)) return "Not computed";
    if (res.rank_best !== res.rank_worst) return `${ordinal(res.rank_best)} to ${ordinal(res.rank_worst)}`;
    return known(c, "ranked") && c.ranked > 0
      ? `${ordinal(res.rank_best)} of ${formatCount(c.ranked)}`
      : `${ordinal(res.rank_best)} of all in order`;
  }
  return hasPlace(res) ? ordinal(res.rank_complete120) : "Not computed";
}

// What the large figure counts among. Plain views give one place only; opts.method adds
// what counting the range schools could do. opts.shortlist as in rankSentence. opts.counts: from countsFrom.
export function placeContext(school: PlacedSchool, ruleId: CopyRuleId, opts: PlaceOpts = {}): string {
  const r = rule(ruleId);
  const c = countsOf(opts, ruleId);
  if (school.cohort === "queue")
    return "Its record is incomplete, so it has no place in the list until the missing details are checked. That says nothing about its need.";
  const res = resultFor(school, ruleId);
  if (school.cohort === "interval") {
    if (!hasBounds(res))
      return `${capitalise(r.name)} was only run on ${completePhrase(c)}, and this school has a missing reading.`;
    if (res.rank_best === res.rank_worst)
      return `Among ${orderedPhrase(c)}. ${shortMissing(school)}, but under this rule that cannot change its place in the list.${shortlistClause(res, opts.shortlist)}`;
    return `Possible places among ${orderedPhrase(c)}. ${missingReadingsClause(school)}, so the screen shows the highest and lowest places in the list it could take.${shortlistClause(res, opts.shortlist)}`;
  }
  if (!hasPlace(res)) return `${capitalise(r.name)} has no result for this school.`;
  const head = `Among ${completePhrase(c)}.`;
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
    return `This rule was not run on ${amongAllOrdered(c)}, so only its place in the list among ${completePhrase(c)} is available.`;
  }
  if (!rangeCountClause(res, c)) return `Counting ${rangePhrase(c)} does not change its place in the list.`;
  const where =
    res.rank_best === res.rank_worst
      ? ordinal(res.rank_best)
      : `between ${ordinal(res.rank_best)} and ${ordinal(res.rank_worst)}`;
  return `Once ${rangePhrase(c)} are counted, it would sit ${where} of ${amongAllOrdered(c)}.`;
}

type Standing =
  | { readonly kind: "point"; readonly place: number }
  | { readonly kind: "range"; readonly best: number; readonly worst: number }
  | { readonly kind: "none" };

// How a school stands under one rule: one place, a range of places (or a range whose ends meet), or none.
// A school with a range under the rule shown reads its range first; any other school reads its place first.
function standing(school: PlacedSchool, res: CopyResult | null): Standing {
  const point: Standing | null = hasPlace(res) ? { kind: "point", place: res.rank_complete120 } : null;
  const range: Standing | null = hasBounds(res)
    ? { kind: "range", best: res.rank_best, worst: res.rank_worst }
    : null;
  return (school.cohort === "interval" ? (range ?? point) : (point ?? range)) ?? { kind: "none" };
}

// One school under two rules: a range school's possible places, or a single place for the others.
// Each place is said against the group of the rule that gave it, because the groups differ between rules.
export function rangeComparisonSentence(
  school: PlacedSchool,
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  opts: Pick<PlaceOpts, "counts" | "countsByRule"> = {}
): string {
  const a = rule(ruleA),
    b = rule(ruleB);
  const cA = countsOf(opts, ruleA),
    cB = countsOf(opts, ruleB);
  const name = displayName(school);
  const sa = standing(school, resultFor(school, ruleA)),
    sb = standing(school, resultFor(school, ruleB));
  const held = school.cohort === "queue";
  if (sa.kind === "none" && sb.kind === "none") {
    return held
      ? `${name} cannot be put in order under ${a.name} or ${b.name} yet, because its record is incomplete.`
      : `${name} is not computed under ${a.name} or ${b.name}, because both were only run on ${completePhrase(cA)}.`;
  }
  if (sa.kind === "point" && sb.kind === "point") {
    if (sharedSize(cA, cB, "complete"))
      return `Among ${completePhrase(cA)}, ${name} is ${ordinal(sa.place)} under ${a.name} and ${ordinal(sb.place)} under ${b.name}.`;
    return `Under ${a.name}, ${name} is ${ordinal(sa.place)} among ${completePhrase(cA)}. Under ${b.name}, it is ${ordinal(sb.place)} among ${completePhrase(cB)}.`;
  }
  const where = (st: Standing & { kind: "range" }, rr: { name: string }): string =>
    st.best === st.worst
      ? `${ordinal(st.best)} under ${rr.name}`
      : `anywhere from ${ordinal(st.best)} to ${ordinal(st.worst)} under ${rr.name}`;
  if (
    school.cohort === "interval" &&
    sa.kind !== "point" &&
    sb.kind !== "point" &&
    sharedSize(cA, cB, "ranked")
  ) {
    const among = `Among ${orderedPhrase(cA)}`;
    if (sa.kind === "none" && sb.kind === "range")
      return `${among}, ${name} sits ${where(sb, b)}. It is not computed under ${a.name}.`;
    if (sb.kind === "none" && sa.kind === "range")
      return `${among}, ${name} sits ${where(sa, a)}. It is not computed under ${b.name}.`;
    if (sa.kind === "range" && sb.kind === "range")
      return `${among}, ${name} sits ${where(sa, a)}, and ${where(sb, b)}.`;
  }
  // Each side on its own, with its own group.
  const clause = (
    st: Standing,
    rr: { name: string },
    c: CountBag | undefined,
    lead: string,
    it: string
  ): string => {
    if (st.kind === "point")
      return `Under ${rr.name}, ${lead} ${ordinal(st.place)} among ${completePhrase(c)}.`;
    if (st.kind === "range")
      return st.best === st.worst
        ? `Under ${rr.name}, ${lead} ${ordinal(st.best)} among ${orderedPhrase(c)}.`
        : `Under ${rr.name}, ${it} could be anywhere from ${ordinal(st.best)} to ${ordinal(st.worst)} among ${orderedPhrase(c)}.`;
    return held
      ? `${capitalise(it)} cannot be put in order under ${rr.name} yet, because its record is incomplete.`
      : `${capitalise(it)} is not computed under ${rr.name}.`;
  };
  const sides: [Standing, { name: string }, CountBag | undefined][] = [
    [sa, a, cA],
    [sb, b, cB],
  ];
  if (sa.kind === "none") sides.reverse();
  return sides
    .map(([st, rr, c], i) =>
      i === 0 ? clause(st, rr, c, `${name} is`, name) : clause(st, rr, c, "it is", "it")
    )
    .join(" ");
}

// Question 1: which schools a rule puts first. schools: the full schools array; counts come from it.
export function listStartsSentence(schools: readonly PlacedSchool[], ruleId: CopyRuleId, n = 3): string {
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
    return `Under ${r.name}, no school has every input recorded, so the list has no single places yet.`;
  const k = firsts.length;
  const ranges = schools.filter((s) => {
    const res = resultFor(s, ruleId);
    return s.cohort === "interval" && hasBounds(res) && res.rank_best <= k;
  });
  const names = joinList(firsts.map((s) => displayName(s)));
  const sentence =
    k === 1
      ? `Under ${r.name}, the first of ${completePhrase(c)} is ${names}.`
      : `Under ${r.name}, the first ${countWord(k)} of ${completePhrase(c)} are ${names}.`;
  if (!ranges.length) return sentence;
  return `${sentence} ${joinList(ranges.map((s) => displayName(s)))} could also be among the first ${countWord(k)}, because ${plural(ranges.length, "it shows", "they show")} a range.`;
}

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

// A display name that tells apart two schools whose names differ only in spacing.
// schools: the full schools array. Joins and exports keep the original string and the id.
export function distinctName(school: NamedSchool, schools: readonly NamedSchool[] = []): string {
  const name = displayName(school);
  const twins = schools.filter((x) => x.id !== school.id && displayName(x) === name);
  if (!twins.length) return name;
  const district = cleanedOrNull(school.district);
  if (district && twins.every((x) => cleanedOrNull(x.district) !== district)) return `${name}, ${district}`;
  return `${name} (record ${school.id})`;
}

// A tie note for the card or the row, or null when the school is level with no other.
// Ties are exact: the same screening score, or under need-first the same school need.
export function tieNote(
  school: PlacedSchool,
  ruleId: CopyRuleId,
  schools: readonly PlacedSchool[] = [],
  form: "card" | "row" = "card"
): string | null {
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
    return x.id !== school.id && x.cohort === "complete" && v != null && Math.abs(v - mine) < 1e-12;
  });
  if (!level.length) return null;
  const names = joinList(level.map((x) => distinctName(x, schools)));
  const sameName = level.some((x) => displayName(x) === displayName(school));
  const nameRule = sameName ? "by the name as recorded, which differs only in spacing" : "by school name";
  if (nf) {
    const mineSecond = second(school);
    const exact = level.filter((x) => {
      const s2 = second(x);
      return s2 != null && mineSecond != null && Math.abs(s2 - mineSecond) < 1e-12;
    });
    if (form === "row") return `Same school need as ${names}`;
    return exact.length === level.length
      ? `It has exactly the same school need and other inputs as ${names}, so the order goes ${nameRule}.`
      : `It has exactly the same school need as ${names}, so the other inputs decide which comes first.`;
  }
  if (form === "row") return `Level with ${names}`;
  return `It has exactly the same screening score as ${names}, so the order goes ${nameRule}.`;
}
