/** Fixed strings: the caveats, the scope lines and the notes that several screens repeat. */
import {
  AIR_DEFINITION,
  GROUPS_MEANING,
  SCHOOL_NEED_DEFINITION,
  SEPARATE_MEASURES,
  SOURCE_LINE,
} from "./definitions";
import { formatCount, lowerFirst, plural } from "./format";
import {
  amongAllOrdered,
  completePhrase,
  groupsSentence,
  known,
  rangeSubject,
  urgencyDefinition,
} from "./counts";
import type { CountBag } from "./model";

/* --------------------------------------------------------- fixed strings */

// The fixed strings for a set of counts; STRINGS is the count-free version.
export function buildStrings(c: CountBag = {}) {
  const scopeShort =
    known(c, "ranked") && known(c, "complete") && known(c, "range")
      ? `${formatCount(c.ranked)} ${plural(c.ranked, "school", "schools")} can be put in order, ${formatCount(c.complete)} with every input recorded and ${formatCount(c.range)} that ${plural(c.range, "shows", "show")} a range of places.`
      : "Schools with every input recorded have one place; schools that show a range have possible places.";
  return Object.freeze({
    caveat:
      "This screen proposes schools for inspection. It does not establish school condition, site safety, intervention benefit or an optimal investment plan.",
    // Precise wording for analyst views and exports; plain views use caveatPlain.
    caveatAnalyst:
      "This screen proposes schools for inspection. It does not establish school condition, site safety, intervention benefit or an optimal investment plan.",
    caveatPlain:
      "This tool suggests which schools to look at first. It does not show a school's real condition or safety, whether repairs would help, or how to spend money.",
    groups: groupsSentence(c),
    groupsMeaning: GROUPS_MEANING,
    scopeComplete: `${groupsSentence(c)} ${GROUPS_MEANING} Single places count among ${known(c, "complete") ? `the ${formatCount(c.complete)}` : "the schools with every input recorded"}.`,
    scopeRanked: `${groupsSentence(c)} ${GROUPS_MEANING} Ranges count among ${amongAllOrdered(c)}.`,
    // Short line for under the tabs; the detail goes in a disclosure or help card.
    scopeShort,
    scopeDetail: `${GROUPS_MEANING} Single places count among ${completePhrase(c)}, and ranges among ${amongAllOrdered(c)}.`,
    filterNote: `Filtered view. Places in the list still count among ${amongAllOrdered(c)}, because filtering never changes the scale.`,
    listOrder: `${rangeSubject(c)} listed where they would sit if their missing readings added nothing to their screening score. The study uses this as its main order.`,
    listOrderUpper: `Sensitivity check: ${lowerFirst(rangeSubject(c))} listed where they would sit if their missing readings added as much as they can to their screening score.`,
    queueIntro:
      "These schools have no place in the list yet because their records are incomplete. Having no place in the list yet does not mean their need is low.",
    queueOrder: "Listed by province, district and school name. This is not an order of priority.",
    notRecorded: "Not recorded",
    noReading: "No reading",
    notPlaced: "Cannot be put in order yet",
    cannotWorkOut: "Cannot be worked out",
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
  });
}
export const STRINGS = buildStrings();
