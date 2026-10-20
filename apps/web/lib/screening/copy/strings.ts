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
import type { CountBag } from "./model";

/* ------------------------------------------------------ the persistence flag */

// The margin in percentage points to one decimal, or null when it is unknown or rounds to 0.
function marginPoints(se: number | undefined): number | null {
  if (se === undefined || !(se > 0)) return null;
  const v = Number((se * 100).toFixed(1));
  return v > 0 ? v : null;
}

/**
 * A flagged school whose lowest frequency is within one standard error of the line, in one sentence. The margin is
 * the test's standard error from the circulated list's provenance block, as a fraction; without it the sentence
 * states no number.
 */
export function persistentNearLine(standardError?: number): string {
  const pts = marginPoints(standardError);
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
  const scopeShort =
    known(c, "ranked") && known(c, "complete") && known(c, "range")
      ? !readsReadings
        ? `${formatCount(c.ranked)} ${plural(c.ranked, "school", "schools")} can be put in order, ${c.complete === c.ranked ? "all" : formatCount(c.complete)} with ${every}.`
        : `${formatCount(c.ranked)} ${plural(c.ranked, "school", "schools")} can be put in order, ${formatCount(c.complete)} with ${every} and ${formatCount(c.range)} that ${plural(c.range, "shows", "show")} a range of places.`
      : readsReadings
        ? `Schools with ${every} have one place; schools that show a range have possible places.`
        : `Schools with ${every} have one place each.`;
  const groups = groupsSentence(c, reads);
  return Object.freeze({
    groups,
    scopeComplete: `${groups} ${GROUPS_MEANING} Single places count among ${known(c, "complete") ? `the ${formatCount(c.complete)}` : `the schools with ${every}`}.`,
    scopeRanked: `${groups} ${GROUPS_MEANING} Ranges count among ${amongAllOrdered(c)}.`,
    // Short line for under the tabs; the detail goes in a disclosure or help card.
    scopeShort,
    scopeDetail: `${GROUPS_MEANING} Single places count among ${completePhrase(c, reads)}, and ranges among ${amongAllOrdered(c)}.`,
    // The label for the scale of a range, with the number of schools the rule puts in order.
    amongAll: capitalise(amongAllOrdered(c)),
    filterNote: `Filtered view. Places in the list still count among ${completePhrase(c, reads)}${readsReadings ? `, and ranges among ${amongAllOrdered(c)}` : ""}, because filtering never changes the scale.`,
    // A rule that reads no air-quality, emissions or land-cover figure shows no range, so it has nothing to place.
    listOrder: readsReadings
      ? `${rangeSubject(c)} listed where ${theyWould(c)} if ${theirScore(c)} missing readings added nothing to ${theirScore(c)} screening score. The study uses this as its main order.`
      : "No school shows a range under this rule, because it does not read the air-quality, emissions or land-cover figures.",
    listOrderUpper: readsReadings
      ? `Sensitivity check: ${lowerFirst(rangeSubject(c))} listed where ${theyWould(c)} if ${theirScore(c)} missing readings added as much as they can to ${theirScore(c)} screening score.`
      : "The sensitivity check for schools that show a range does not apply under this rule, because no school shows one.",
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
    notRecorded: "Not recorded",
    noReading: "No reading",
    notPlaced: "Cannot be put in order yet",
    cannotWorkOut: "Cannot be worked out",
    noResult: "No result",
    scoreNote: "Each input runs from 0 to 1; higher means more reason to look.",
    persistentFlag:
      "Often in the top 20 when the paper changed the factors' shares at random. That test used the paper's main rule, with urgency, and has not been redone for the proposed revision.",
    // Method detail for analyst views only.
    persistentFlagMethod:
      "Persistent candidate: certain top-20 membership in at least 80% of 5,000 Dirichlet weight draws in each of the three concentration settings (20/15, 40/35 and 100/80) of the circulated, urgency-included experiment.",
    defaultRuleNote:
      "The screen opens on the paper's main rule, the combined-factors rule with urgency (S). The proposed revision, the combined-factors rule without urgency (S0), is one click away.",
    proposedPending: "Proposed revision. Awaiting the research team's review.",
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
