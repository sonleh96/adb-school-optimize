/** The How this works sections, the worked example in them and the five first-visit questions. */
import {
  SCHOOL_NEED_DEFINITION,
  GROUPS_MEANING,
  REMOTENESS_SCALE,
  SEPARATE_MEASURES,
  SIX_FACILITIES,
  SOURCE_LINE,
} from "./definitions";
import { formatCount, lowerFirst, ordinal, plural, displayName } from "./format";
import {
  allRecords,
  amongAllOrdered,
  groupsSentence,
  known,
  rangeSubject,
  theirScore,
  theyWould,
  urgencyDefinition,
} from "./counts";
import { agreementSentence, findPair, pairPhrase } from "./compare";
import { IDEAS } from "./ideas";
import type { ComparisonData, CountBag, CountsByRule, CountsByRuleArg } from "./model";
import { distinctName, hasBounds, perRule, resultFor, sharedSize } from "./rank";
import { nameSegment, seg, textOf, type Segments } from "./segments";

/* ------------------------------------------- explainer and first questions */

// Six sections for the How this works page, each a title and its sentences in order.
// example: an optional data-driven example sentence for the last section (copyFor supplies one).
export function buildHow(c: CountBag = {}, example: string | null = null) {
  const noRange = known(c, "range") && c.range === 0;
  return Object.freeze(
    [
      {
        key: "purpose",
        title: "What this screen is for",
        sentences: [
          "This screen suggests which existing secondary schools to inspect first.",
          `It works only from records already gathered for ${known(c, "all") && c.all > 0 ? `${formatCount(c.all)} ${plural(c.all, "school", "schools")}` : "the schools in the data"}.`,
          "It puts them in order under a rule you choose and shows what put each school where it is.",
          "It does not establish a school's condition, site safety, what repairs would achieve or what to fund.",
          "An inspection visit and a rehabilitation appraisal do that.",
          SOURCE_LINE,
        ],
      },
      {
        key: "placed",
        title: "Which schools can be put in order",
        sentences: [
          "A school can be put in order only when its record has everything school need uses.",
          "That means a classroom count above 0 and how many classrooms are built of permanent materials, a teacher count above 0 and the number of teacher houses, all six facility counts, a power and a water source, and a remoteness category.",
          // The counts here are the paper's main rule's; another rule can put a different number of schools in a group.
          `Under the paper's main rule, ${lowerFirst(groupsSentence(c))}`,
          GROUPS_MEANING,
          // With none held back there is no "other" to describe.
          known(c, "queue") && c.queue === 0
            ? null
            : known(c, "queue") && c.queue === 1
              ? "The other one has an incomplete record and no place in the list yet, and it shows what is missing."
              : `The other${known(c, "queue") && c.queue > 1 ? ` ${formatCount(c.queue)}` : "s"} have incomplete records and no place in the list yet, and each one shows what is missing.`,
          "The tool never fills in a missing detail or counts it as 0.",
        ],
      },
      {
        key: "need",
        title: "School need",
        sentences: [
          SCHOOL_NEED_DEFINITION,
          "Each part runs from 0 to 1 and counts equally.",
          "Classrooms not of permanent materials is the share of classrooms built of semi-permanent or bush materials rather than permanent ones.",
          "Teacher housing shortfall is how far teacher houses fall short of teachers.",
          `Missing facility types is the share of six types the school lacks: ${SIX_FACILITIES}.`,
          "Power and water averages a power value and a water value on a scale the study set, so a generator counts more than the grid, and river or lake water more than piped water.",
          `Remoteness comes from the school's recorded category on ${REMOTENESS_SCALE}; it describes how remote the location is, not disability access.`,
          "Because remoteness is one of the five parts, school need is not only about buildings.",
          "Toilet records are kept but change nothing, because every recorded school has the same entry.",
        ],
      },
      {
        key: "inputs",
        title: "The other inputs",
        sentences: [
          "District context mixes six district figures: the shares of students moving on from Grade 7 to Grade 10 and from Grade 7 to Grade 12, secondary enrolment, night-time light, conflict exposure and girls' share of enrolment.",
          "Every school in a district shares the same district context.",
          "Walking reach is how many people live within modelled walking distance; it does not measure how hard the journey is or who would benefit.",
          "Air quality is an air-pollution index assigned to the school's location, nearby emissions are greenhouse gases recorded for fixed sources within 10 km, and land cover is the share of water and flooded vegetation within 500 m.",
          SEPARATE_MEASURES,
          "By the study's convention, a higher value on each asks for a closer look; that is not evidence of harm.",
          urgencyDefinition(c),
          "The rules without urgency leave it out for that reason.",
          `Most inputs are rescaled from 0 to 1 against the values near the low and high ends of ${allRecords(c)}, and filtering the screen never changes that scale.`,
        ],
      },
      {
        key: "rules",
        title: "How a rule turns inputs into an order",
        sentences: [
          "The paper's main rule, the combined-factors rule with urgency (S), adds up the inputs, each with a fixed share, to give a screening score: school need 60%, district context 15%, and 5% each for urgency, walking reach, air quality, emissions and land cover.",
          "A rise of 0.1 in school need moves the screening score by 0.06, which is more than any one environment measure can add.",
          "The proposed revision, the combined-factors rule without urgency (S0), drops urgency and keeps the other shares in proportion: school need about 63%, district context about 16% and the other four about 5% each.",
          "The need-first rules order schools by school need alone, and other inputs only break exact ties.",
          "The largest-factor rules take 60% of a combined-factors rule's screening score and add 40% of the school's largest input: school need or district context, or also the urgency value in the rule with urgency.",
          "The conventional benchmark (B) gives school need 55%, district context 20%, urgency 15% and walking reach 10%.",
          "When two schools are exactly level, the school name decides, in alphabetical order.",
          "The shares were set before anyone looked at which schools came out on top, and the rules without urgency keep them in proportion.",
          "No rule sets a threshold for safety or funding, and none has been shown to find true need more accurately than another.",
        ],
      },
      {
        key: "limits",
        title: "What the results cannot tell you",
        sentences: [
          // With no school showing a range there is nothing to list by its range.
          noRange
            ? null
            : `${rangeSubject(c)} listed where ${theyWould(c)} if ${theirScore(c)} missing readings added nothing to ${theirScore(c)} screening score, the study's main order.`,
          noRange
            ? null
            : "Listing them where air quality adds as much as it can is available as a labelled sensitivity check.",
          noRange
            ? null
            : known(c, "complete") && known(c, "ranked")
              ? `Under the paper's main rule, places among the ${formatCount(c.complete)} and possible places among all ${formatCount(c.ranked)} answer different questions.`
              : "Places among the schools with every input recorded and possible places among all schools that can be put in order answer different questions.",
          example ||
            "Agreement among the schools with every input recorded does not carry over to all schools that can be put in order, because the schools that show a range can still move.",
          "Having no place in the list yet says nothing about a school's need.",
          "The results come from checks the project ran on its own calculations; no one outside the project has reproduced them yet, and planners have not yet tested the screen.",
        ],
      },
    ].map((x) =>
      Object.freeze({ ...x, sentences: Object.freeze(x.sentences.filter((t): t is string => t !== null)) })
    )
  );
}
export const HOW_IT_WORKS = buildHow();

// The explainer's example: the range school whose possible places move most between the two main rules.
export function howExampleSegments(
  data: ComparisonData,
  c: CountBag,
  byRule?: CountsByRuleArg
): Segments | null {
  const row = findPair(data.pairwise || [], "additive_u", "additive_no_u");
  if (!row) return null;
  const moved = (data.schools || [])
    .flatMap((x) => {
      const a = resultFor(x, "additive_u"),
        b = resultFor(x, "additive_no_u");
      return x.cohort === "interval" && hasBounds(a) && hasBounds(b)
        ? [{ x, a, b, d: Math.abs(a.rank_best - b.rank_best) + Math.abs(a.rank_worst - b.rank_worst) }]
        : [];
    })
    .filter((m) => m.d > 0)
    .sort((m1, m2) => m2.d - m1.d || displayName(m1.x).localeCompare(displayName(m2.x)));
  if (!moved.length) return null;
  const { x, a, b } = moved[0];
  const span = (r: { rank_best: number; rank_worst: number }) =>
    r.rank_best === r.rank_worst
      ? ordinal(r.rank_best)
      : `${ordinal(r.rank_best)} to ${ordinal(r.rank_worst)}`;
  const agree = lowerFirst(agreementSentence(row, 20, "with or without urgency")).replace(/\.$/, "");
  const strict = perRule({ countsByRule: byRule });
  const cA = strict ? (byRule as CountsByRule).additive_u : c,
    cB = strict ? (byRule as CountsByRule).additive_no_u : c;
  const among = sharedSize(cA, cB, "ranked", strict)
    ? amongAllOrdered(cA)
    : "all the schools that can be put in order under each rule";
  return seg`For example, among ${pairPhrase(row)}, ${agree}, but ${nameSegment(distinctName(x, data.schools))}'s possible places among ${among} move from ${span(a)} with urgency to ${span(b)} without it.`;
}
export function howExample(data: ComparisonData, c: CountBag, byRule?: CountsByRuleArg): string | null {
  const s = howExampleSegments(data, c, byRule);
  return s === null ? null : textOf(s);
}

// The five acceptance questions from the round-2 brief, with short answers.
// live names the function that gives the answer for the current rule and school.
// The trust answer matches urgencyReassurance() on the recorded comparison; check.mjs holds them equal.
export const TRUST_TAIL =
  "The research team is reviewing the revision that leaves it out, so the screen opens on the paper's main rule.";
export function buildQuestions(
  ideas: Pick<typeof IDEAS, "ranges" | "queue"> = IDEAS,
  trust: string | null = null
) {
  return Object.freeze(
    [
      {
        key: "purpose",
        question: "Which schools does the paper's rule suggest inspecting first?",
        answer:
          "The list starts with them, in the order the paper's main rule suggests. A place in the list is a suggestion, not a verdict on a school's condition, safety or funding.",
        live: "listStartsSentence",
      },
      {
        key: "why",
        question: "Why does a given school sit where it does?",
        answer:
          "Select a school to see the two or three things that add most to its screening score, described with its own record.",
        live: "reasonSentence",
      },
      {
        key: "ranges",
        question: "Why do some schools show a range instead of one place?",
        answer: ideas.ranges.short,
        live: "rankSentence",
      },
      {
        key: "incomplete",
        question: "Which schools cannot be put in order yet, and what is missing for them?",
        answer: ideas.queue.short,
        live: "missingSentence",
      },
      {
        key: "trust",
        question: "What changes if the uncertain urgency value is left out?",
        answer:
          trust ||
          `The comparison shows how many of the top schools stay the same with or without the urgency value. ${TRUST_TAIL}`,
        live: "urgencyReassurance",
      },
    ].map((q) => Object.freeze(q))
  );
}
export const FIRST_QUESTIONS = buildQuestions();
