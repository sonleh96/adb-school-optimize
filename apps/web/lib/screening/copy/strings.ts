/** Fixed strings: the caveats, the scope lines and the notes that several screens repeat. */
import {
  AIR_DEFINITION,
  GROUPS_MEANING,
  SCHOOL_NEED_DEFINITION,
  SEPARATE_MEASURES,
  SOURCE_LINE,
} from "./definitions";
import { capitalise, formatCount, lowerFirst, plural } from "./format";
import {
  amongAllOrdered,
  completePhrase,
  everyInput,
  groupsSentence,
  known,
  rangeSubject,
  theirScore,
  theyWould,
  urgencyDefinition,
  type Reads,
} from "./counts";
import type { CountBag, PersistenceRule } from "./model";

/* ------------------------------------------------------ the persistence flag */

// The margin in percentage points to one decimal, or null when it is unknown or rounds to 0.
function marginPoints(se: number | undefined): number | null {
  if (se === undefined || !(se > 0)) return null;
  const v = Number((se * 100).toFixed(1));
  return v > 0 ? v : null;
}

/**
 * What the flag means under each rule the stochastic test ran for, in one sentence each. Each rule has its own
 * experiment: neither is read as the other's result, and the rule without urgency is not a re-labelled copy of the
 * circulated one.
 */
export const PERSISTENT_FLAG: Readonly<Record<PersistenceRule, string>> = Object.freeze({
  additive_no_u:
    "Often in the top 20 when the paper changed the factors' shares at random. That test drew new shares for the six factors this rule uses, so it is a fresh run for this rule, not a measure of what the urgency value changes.",
  additive_u:
    "Often in the top 20 when the circulated paper changed the factors' shares at random. That test included urgency, so it is the circulated experiment's result and not a result for the rule without urgency.",
});

/**
 * A flagged school whose lowest frequency is just above the line, in one sentence. The margin is how far above the
 * line the rule's test counts as just above, as a fraction: its standard error times the number of standard errors
 * its band spans, from the provenance block of the list of the rule the test was run for. Without it the sentence
 * states no number.
 */
export function persistentNearLine(margin?: number): string {
  const pts = marginPoints(margin);
  return `In that test it stayed in the top 20 only just often enough to be flagged${pts === null ? "" : `, within ${pts} percentage points of the line`}, so another round of random changes to the shares could take the flag away.`;
}

/* --------------------------------------------------------- fixed strings */

/**
 * The lines that say what the groups of schools are, for one rule: its counts and the inputs it reads. A rule that
 * leaves out urgency or the air-quality, emissions and land-cover figures puts a school in order without them, so
 * its group is "every input the rule reads", and the benchmark, which reads no air-quality figure, has no range
 * schools to mention. They are bound per rule (`scope(ruleId)`) so a screen cannot show the main rule's words
 * under another rule.
 */
export function buildScope(c: CountBag = {}, reads?: Reads) {
  const every = everyInput(reads);
  const readsReadings = reads?.readings ?? true;
  // No school shows a range when the rule reads no air-quality figure or when none lacks a reading.
  const noRange = !readsReadings || (known(c, "range") && c.range === 0);
  const noComplete = known(c, "complete") && c.complete === 0;
  let scopeShort: string;
  if (known(c, "ranked") && known(c, "complete") && known(c, "range")) {
    const inOrder = `${formatCount(c.ranked)} ${plural(c.ranked, "school", "schools")} can be put in order`;
    const complete = c.complete === c.ranked ? "all" : formatCount(c.complete);
    const ranges =
      c.range === c.ranked
        ? "all showing"
        : `${formatCount(c.range)} that ${plural(c.range, "shows", "show")}`;
    if (c.ranked === 0) scopeShort = "No school can be put in order.";
    else if (noRange) scopeShort = `${inOrder}, ${complete} with ${every}.`;
    else if (noComplete) scopeShort = `${inOrder}, ${ranges} a range of places.`;
    else scopeShort = `${inOrder}, ${complete} with ${every} and ${ranges} a range of places.`;
  } else {
    scopeShort = readsReadings
      ? `Schools with ${every} have one place; schools that show a range have possible places.`
      : `Schools with ${every} have one place each.`;
  }
  const groups = groupsSentence(c, reads);
  const rangesAmong = noRange ? "" : ` Ranges count among ${amongAllOrdered(c)}.`;
  return Object.freeze({
    groups,
    scopeComplete: `${groups} ${GROUPS_MEANING}${noComplete ? "" : ` Single places count among ${known(c, "complete") ? `the ${formatCount(c.complete)}` : `the schools with ${every}`}.`}`,
    scopeRanked: `${groups} ${GROUPS_MEANING}${rangesAmong}`,
    // Short line for under the tabs; the detail goes in a disclosure or help card.
    scopeShort,
    scopeDetail: `${GROUPS_MEANING} Single places count among ${completePhrase(c, reads)}${noRange ? "" : `, and ranges among ${amongAllOrdered(c)}`}.`,
    // The label for the scale of a range, with the number of schools the rule puts in order.
    amongAll: capitalise(amongAllOrdered(c)),
    filterNote: `Filtered view. Places in the list still count among ${completePhrase(c, reads)}${noRange ? "" : `, and ranges among ${amongAllOrdered(c)}`}, because filtering never changes the scale.`,
    // A rule that reads no air-quality, emissions or land-cover figure shows no range, so it has nothing to place.
    listOrder: !readsReadings
      ? "No school shows a range under this rule, because it does not read the air-quality, emissions or land-cover figures."
      : noRange
        ? "No school shows a range in this list."
        : `${rangeSubject(c)} listed where ${theyWould(c)} if ${theirScore(c)} missing readings added nothing to ${theirScore(c)} screening score. The study uses this as its main order.`,
    listOrderUpper: noRange
      ? !readsReadings
        ? "The sensitivity check for schools that show a range does not apply under this rule, because no school shows one."
        : "The sensitivity check for schools that show a range has nothing to show here, because no school shows one."
      : `Sensitivity check: ${lowerFirst(rangeSubject(c))} listed where ${theyWould(c)} if ${theirScore(c)} missing readings added as much as they can to ${theirScore(c)} screening score.`,
  });
}

// The fixed strings for a set of counts; STRINGS is the count-free version.
export function buildStrings(c: CountBag = {}) {
  return Object.freeze({
    caveat:
      "This screen proposes schools for inspection. It does not establish school condition, site safety, intervention benefit or an optimal investment plan.",
    // Precise wording for analyst views and exports; plain views use caveatPlain.
    caveatAnalyst:
      "This screen proposes schools for inspection. It does not establish school condition, site safety, intervention benefit or an optimal investment plan.",
    caveatPlain:
      "This tool suggests which schools to look at first. It does not show a school's real condition or safety, whether repairs would help, or how to spend money.",
    groupsMeaning: GROUPS_MEANING,
    queueIntro:
      "These schools have no place in the list yet because their records are incomplete. Having no place in the list yet does not mean their need is low.",
    queueOrder: "Listed by province, district and school name. This is not an order of priority.",
    // The order when the incomplete records are grouped by what is missing, the largest group first.
    queueOrderMissing:
      "Grouped by what is missing, the largest group first. Within a group, listed by province, district and school name. This is not an order of priority.",
    notRecorded: "Not recorded",
    noReading: "No reading",
    notPlaced: "Cannot be put in order yet",
    cannotWorkOut: "Cannot be worked out",
    noResult: "No result",
    scoreNote: "Each input runs from 0 to 1; higher means more reason to look.",
    persistentFlag: PERSISTENT_FLAG,
    defaultRuleNote:
      "The screen opens on the paper's main rule, the combined-factors rule without urgency (S0). The circulated paper's rule with urgency, the combined-factors rule with urgency (S), is one click away as a sensitivity check.",
    source: SOURCE_LINE,
    schoolNeedDefinition: SCHOOL_NEED_DEFINITION,
    airQualityDefinition: AIR_DEFINITION,
    urgencyDefinition: urgencyDefinition(c),
    separateMeasures: SEPARATE_MEASURES,
    comparisonSource: "These figures come from the study's recorded comparison of the rules.",
    persistentNearLine: persistentNearLine(),
  });
}
export const STRINGS = buildStrings();
