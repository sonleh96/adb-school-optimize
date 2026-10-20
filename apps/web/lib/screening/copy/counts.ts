/**
 * Counts taken from the data they describe. Every count in the copy comes from here, never from a constant.
 * A function that states a count takes `opts.counts` and, without it, says the same thing without a number.
 */
import { SMALL, capitalise, formatCount, plural } from "./format";
import type { CountBag, CountableSchool, Counts } from "./model";

/** A school whose record gives only its remoteness category and nothing else. */
export function isRemotenessOnly(school: CountableSchool): boolean {
  return (
    Array.isArray(school.gate_failures) &&
    school.gate_failures.length === 4 &&
    !!school.condition &&
    Object.values(school.condition).every((v) => v == null) &&
    school.locality != null
  );
}

export function countsFrom(schools: readonly CountableSchool[] = []): Counts {
  const c = {
    all: schools.length,
    complete: 0,
    range: 0,
    queue: 0,
    urgencyZero: 0,
    emissionsNone: 0,
    airMissing: 0,
    remotenessOnly: 0,
    flagged: 0,
    ranked: 0,
  };
  for (const s of schools) {
    if (s.cohort === "complete") c.complete += 1;
    else if (s.cohort === "interval") c.range += 1;
    else if (s.cohort === "queue") c.queue += 1;
    if (s.components && s.components.U === 0) c.urgencyZero += 1;
    if (s.cohort !== "queue" && s.raw && s.raw.E_raw === 0) c.emissionsNone += 1;
    if (s.cohort !== "queue" && s.raw && s.raw.Q_raw == null) c.airMissing += 1;
    if (s.cohort === "queue" && isRemotenessOnly(s)) c.remotenessOnly += 1;
    if (s.persistent_candidate_circulated) c.flagged += 1;
  }
  c.ranked = c.complete + c.range;
  return Object.freeze(c);
}

/** True when the count is known: present and a whole number. Narrows `c` so the count can be read. */
export function known<K extends string>(
  c: CountBag | null | undefined,
  k: K
): c is CountBag & Record<K, number> {
  return !!c && Number.isInteger(c[k]);
}

export const countWord = (n: number): string => (n < 10 ? SMALL[n] : formatCount(n));
export const countSuffix = (c: CountBag | undefined, k: string): string =>
  known(c, k) ? ` (${formatCount(c[k])})` : "";

/** "the 36 schools with every input recorded" or, without counts, "the schools with every input recorded". */
export function theSchools(c: CountBag | undefined, k: string, rest: string): string {
  if (!known(c, k) || c[k] === 0) return `the schools ${rest}`;
  if (c[k] === 1) return `the one school ${rest}`;
  return `the ${formatCount(c[k])} schools ${rest}`;
}

export const completePhrase = (c: CountBag | undefined): string =>
  theSchools(c, "complete", "with every input recorded");
export const orderedPhrase = (c: CountBag | undefined): string =>
  theSchools(c, "ranked", "that can be put in order");
export const rangePhrase = (c: CountBag | null | undefined): string => {
  if (!known(c, "range") || c.range === 0) return "the schools that show a range";
  return c.range === 1
    ? "the one school that shows a range"
    : `the ${countWord(c.range)} schools that show a range`;
};
export const allRecords = (c: CountBag | undefined): string =>
  known(c, "all") && c.all > 0 ? `all ${formatCount(c.all)} records` : "all the records";

// "The four schools that show a range are" / "The one school that shows a range is".
export const rangeSubject = (c: CountBag | undefined): string =>
  `${capitalise(rangePhrase(c))} ${known(c, "range") && c.range === 1 ? "is" : "are"}`;
export const amongAllOrdered = (c: CountBag | undefined): string =>
  known(c, "ranked") && c.ranked > 0
    ? `all ${formatCount(c.ranked)} schools that can be put in order`
    : "all schools that can be put in order";

// One sentence for the groups, explained together wherever either count first appears.
export function groupsSentence(c: CountBag | undefined): string {
  // The prototype read `ranked` unchecked; a bag that lacks it now gets the count-free sentence instead of "NaN".
  if (!known(c, "complete") || !known(c, "range") || !known(c, "ranked")) {
    return "Schools with every input recorded have one place each, and schools that lack a reading such as air quality show a range of places; together they can be put in order.";
  }
  const { ranked } = c;
  const done = `${formatCount(c.complete)} ${plural(c.complete, "school has", "schools have")} every input recorded`;
  if (c.range === 0)
    return `${done}, so ${formatCount(ranked)} ${plural(ranked, "school", "schools")} can be put in order.`;
  const more = `${countWord(c.range)} more ${plural(c.range, "lacks", "lack")} a reading such as air quality and ${plural(c.range, "shows", "show")} a range of places`;
  return `${done}, and ${more}, so ${formatCount(ranked)} ${plural(ranked, "school", "schools")} can be put in order.`;
}

// The urgency definition; with counts it says how many schools have 0.
export function urgencyDefinition(c: CountBag | undefined): string {
  const head =
    "The urgency value is a number supplied with the original school data and described as hazard-related; how it was made could not be traced, so what it measures is not known";
  if (!known(c, "urgencyZero") || !known(c, "all") || c.all === 0) return `${head}.`;
  let who: string;
  if (c.urgencyZero === 0) who = "no school has 0";
  else if (c.urgencyZero === c.all) who = "every school has 0";
  else if (c.urgencyZero * 2 > c.all) who = "most schools have 0";
  else who = `${formatCount(c.urgencyZero)} of the ${formatCount(c.all)} schools have 0`;
  return `${head}, and ${who}.`;
}
