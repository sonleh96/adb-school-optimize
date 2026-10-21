/** The term map: what the interface shows for each idea, with a one-line meaning and a longer help text. */
import {
  REMOTENESS_SCALE,
  SCHOOL_NEED_DEFINITION,
  SIX_FACILITIES,
  SOURCE_LINE,
  GROUPS_MEANING,
} from "./definitions";
import { capitalise, formatCount, plural } from "./format";
import {
  allRecords,
  completePhrase,
  countSuffix,
  countWord,
  everyInput,
  groupsSentence,
  known,
  orderedPhrase,
  numbersHelp,
  oneRange,
  rangePhrase,
  theirScore,
  urgencyDefinition,
  type Reads,
} from "./counts";
import type { CountBag, Term } from "./model";

/* ------------------------------------------------------------- term map */
// label: what the interface shows. line: one sentence, for tooltips and legends.
// help: the longer explanation, for a help panel. where: where it appears (for designers).
// technical: the research term (analyst copy only).

// ", 40 schools" when the count is known, and nothing when it is not.
const schoolsSuffix = (c: CountBag, k: string): string =>
  known(c, k) ? `, ${formatCount(c[k])} ${plural(c[k], "school", "schools")}` : "";

// The term map for a set of counts; TERMS is the count-free version.
// How many schools have the persistence flag, when the data says. Without a count nothing is claimed, and a count of
// 0 is said as a zero.
const flaggedLine = (c: CountBag): string => {
  if (!known(c, "flagged")) return "";
  if (c.flagged === 0) return " No school has the flag.";
  return ` ${capitalise(countWord(c.flagged))} ${plural(c.flagged, "school has", "schools have")} the flag.`;
};

/**
 * The term map for a set of counts. `reads` says which inputs the rule shown reads, which decides what "every input
 * recorded" means for its groups; without it the terms are worded for a rule that reads every input. Bound
 * per rule as `termsFor(ruleId)`; the bound `TERMS` is worded without group sizes (see `groupFree`).
 */
export function buildTerms(c: CountBag = {}, reads?: Reads) {
  const terms = {
    screening: {
      technical: "Inspection screening",
      label: "Screening",
      line: "Putting existing schools in a suggested order for a closer look, using the records we have.",
      help: "This tool screens the schools in the data. It suggests which ones to inspect first under a chosen rule. It does not visit schools or check their records, and it does not decide funding.",
      where: "Product name line, How this works, export title",
    },
    inspection: {
      technical: "Inspection and rehabilitation appraisal",
      label: "Inspection",
      line: "A visit that finds out a school's actual condition and what work, if any, it needs.",
      help: "Inspection comes after screening. An inspection and a rehabilitation appraisal establish the facts the screen cannot: building condition, site safety, what could be done and what it would cost.",
      where: "Caveat, the first idea, How this works",
    },
    source: {
      technical: "Circulated manuscript, 12 October 2026",
      label: "Source",
      line: SOURCE_LINE,
      help: "The research team circulated the paper for review. The three rules without urgency are a proposed change that the research team has not yet reviewed.",
      where: "Footer, How this works, export method record",
    },
    rule: {
      technical: "Decision rule",
      label: "Rule",
      line: "A fixed recipe that turns each school's inputs into a place in the list.",
      help: "Each rule combines the same inputs differently, so each gives a different order. The study set each rule's shares before looking at which schools came out on top. No rule has been shown to find true need more accurately than another.",
      where: "Rule headline, rule switch, export header",
    },
    rule_roles: {
      technical: "Rule role and provenance",
      label: "Role",
      line: "The job a rule does on the screen, shown with where the rule comes from.",
      help: "The role is main rule for the two combined-factors rules, strict alternative for the two need-first rules, sensitivity check for the two largest-factor rules, and reference for the conventional benchmark. The source is either as circulated in the paper, for the four rules that use urgency, or proposed and awaiting the research team's review, for the three that leave it out. The screen opens on the combined-factors rule with urgency (S).",
      where: "Under the rule name in the headline, rule switch tooltips",
    },
    school_need: {
      technical: "School need, N",
      label: "School need",
      line: SCHOOL_NEED_DEFINITION,
      help: "Each part runs from 0 to 1 and counts equally. Because remoteness is one of the five parts, school need is not only about buildings. The way power types, water types and remoteness categories are scored is a choice the study made, so treat it as a guide from the records rather than a measurement.",
      where: "Breakdown first row, need-first rule explanations, reason sentences",
    },
    need_classrooms: {
      technical: "Permanent-classroom deficit",
      label: "Classrooms not of permanent materials",
      line: "The share of the school's classrooms not built of permanent materials, as opposed to semi-permanent or bush materials.",
      help: "One minus permanent classrooms divided by all classrooms. It can only be worked out when the record gives at least one classroom.",
      where: "School need breakdown, reason sentences, missing-evidence chips",
    },
    need_housing: {
      technical: "Teacher-housing deficit",
      label: "Teacher housing shortfall",
      line: "How far the number of teacher houses falls short of the number of teachers.",
      help: "One minus teacher houses divided by teachers, never below 0. A school with as many houses as teachers, or more, counts 0. It can only be worked out when the record gives at least one teacher.",
      where: "School need breakdown, reason sentences, missing-evidence chips",
    },
    need_facilities: {
      technical: "Facility-presence deficit",
      label: "Missing facility types",
      line: `The share of the six facility types the study counts that the school does not have: ${SIX_FACILITIES}.`,
      help: "Having one or more of a type counts as having it.",
      where: "School need breakdown, reason sentences, missing-evidence chips",
    },
    need_services: {
      technical: "Service deficit",
      label: "Power and water",
      line: "A value for the school's recorded power and water sources.",
      help: "The average of a power value and a water value, on a scale the study set, where a higher value means a larger shortfall. Power from a generator counts 0.7, solar 0.4, hydro 0.3 and the grid 0.2. Water from a river, stream, creek or lake, or brought from home, counts 1.0. A tank, well or bore counts 0.5, and piped or town supply counts 0.2.",
      where: "School need breakdown, reason sentences, missing-evidence chips",
    },
    need_locality: {
      technical: "Locality disadvantage",
      label: "Remoteness",
      line: `The remoteness category in the school's own record, on ${REMOTENESS_SCALE}.`,
      help: "The category describes how remote the school's location is, not disability access. Highly accessible counts 0, accessible 0.2, moderately accessible 0.45, remote 0.7, very remote 0.9 and extremely remote 1.0.",
      where: "School need breakdown, reason sentences, filters",
    },
    area_context: {
      technical: "Area context, A",
      label: "District context",
      line: "Education and activity conditions in the school's district, on a scale from 0 to 1.",
      help: "It mixes six district figures, each with a fixed share. Every school in the same district gets the same value, so it describes the district, not the school. The shares are moving on from Grade 7 to Grade 10 25%, moving on from Grade 7 to Grade 12 15%, secondary enrolment 25%, night-time light 15%, conflict exposure 10% and girls' share of enrolment 10%.",
      where: "Breakdown, reason sentences, map district layer",
    },
    area_grade10: {
      technical: "Grade 10 progression deficit",
      label: "Moving on from Grade 7 to Grade 10",
      line: "Based on the share of the district's students recorded as moving on from Grade 7 to Grade 10; a lower share adds more.",
      help: "One minus the corrected rate of moving on from Grade 7 to Grade 10. It is a district figure.",
      where: "District context breakdown, reason sentences",
    },
    area_grade12: {
      technical: "Grade 12 progression deficit",
      label: "Moving on from Grade 7 to Grade 12",
      line: "Based on the share of the district's students recorded as moving on from Grade 7 to Grade 12; a lower share adds more.",
      help: "One minus the corrected rate of moving on from Grade 7 to Grade 12. It is a district figure.",
      where: "District context breakdown, reason sentences",
    },
    area_secondary: {
      technical: "Secondary-participation deficit",
      label: "Secondary enrolment",
      line: "How few secondary students the district has for its population, compared with the rest of the data.",
      help: `Based on secondary students per 1,000 people, rescaled against the range across ${allRecords(c)}. Higher means fewer students for the population. It is a district figure.`,
      where: "District context breakdown, reason sentences",
    },
    area_activity: {
      technical: "Activity-scale deficit",
      label: "Night-time light",
      line: "How little night-time light the district shows, which the study uses as a sign of economic activity.",
      help: `Based on satellite night-time light summed over the district, log-scaled and rescaled against the range across ${allRecords(c)}. Higher means less light. It is a district figure and a stand-in, not a direct count of activity.`,
      where: "District context breakdown, reason sentences",
    },
    area_conflict: {
      technical: "Conflict exposure",
      label: "Conflict exposure",
      line: "How many people in the district are exposed to recorded conflict, compared with the rest of the data.",
      help: `Based on the population exposed to conflict events in the source data, log-scaled and rescaled against the range across ${allRecords(c)}. It is a district figure.`,
      where: "District context breakdown, reason sentences",
    },
    area_girls: {
      technical: "Female disadvantage",
      label: "Girls' share of enrolment",
      line: "How far girls fall short of half of the district's enrolled students.",
      help: "It is 0 when girls are half of enrolled students or more, and rises as their share falls. It is a district figure.",
      where: "District context breakdown, reason sentences",
    },
    urgency: {
      technical: "Urgency, U",
      label: "Urgency value (source not traced)",
      line: urgencyDefinition(c),
      help: "A value of 0 does not mean nothing was found. The combined-factors rule with urgency (S) gives it a 5% share and the conventional benchmark (B) 15%. The largest-factor rule with urgency (T) can let it outweigh everything else for a school, because it boosts whichever input is largest. The combined-factors rule without urgency (S0) leaves it out until its source is documented.",
      where: "Breakdown row under rules that use it, rule explanations, urgency note",
    },
    reach: {
      technical: "Reach, R",
      label: "Walking reach",
      line: "How many people live within modelled walking distance of the school, compared with other schools.",
      help: `Based on the modelled walking catchment population, log-scaled and rescaled against the range across ${allRecords(c)}. It does not measure how hard the journey is or how many people would benefit from repairs.`,
      where: "Breakdown, reason sentences",
    },
    air_quality: {
      technical: "Air-quality context, Q",
      label: "Air quality",
      line: "An air-pollution index assigned to the school's location, taken on its worst 1 day in 20.",
      help: [
        `It is the 95th percentile of daily air-quality index values assigned to the school, rescaled against the values near the low and high ends of ${allRecords(c)}.`,
        known(c, "airMissing")
          ? `${capitalise(countWord(c.airMissing))} ${plural(c.airMissing, "school that can be put in order has", "schools that can be put in order have")} no reading.`
          : "",
        "It is a separate measure from emissions and land cover and is never added to them.",
      ]
        .filter(Boolean)
        .join(" "),
      where: "Breakdown, reason sentences, range explanations",
    },
    emissions: {
      technical: "Eligible point-source emissions, E",
      label: "Nearby emissions",
      line: "Greenhouse gases recorded for fixed sources within 10 km of the school.",
      help: [
        "The sum of yearly CO2-equivalent emissions from fixed point sources within 10 km in the Climate TRACE inventory, log-scaled and rescaled.",
        known(c, "emissionsNone") && known(c, "ranked")
          ? `${formatCount(c.emissionsNone)} of ${orderedPhrase(c)} have none nearby.`
          : "",
        "It is not a health or climate measure for the school, and it is never added to air quality or land cover.",
      ]
        .filter(Boolean)
        .join(" "),
      where: "Breakdown, reason sentences",
    },
    land_cover: {
      technical: "Land-cover context, L",
      label: "Land cover (water and flooded vegetation)",
      line: "The share of the area within 500 m of the school that satellite maps class as water or flooded vegetation.",
      help: "Taken from a 2025 satellite land-cover map, as a fraction from 0 to 1. A value of 0 means none of the area was classed that way. It says nothing about site safety, and it is never added to air quality or emissions.",
      where: "Breakdown, reason sentences",
    },
    score: {
      technical: "Score (S, S0, T, T0, B)",
      label: "Screening score",
      line: "A number from 0 to 1 that a rule builds from a school's inputs; a higher screening score puts the school earlier in the list.",
      help: "It is not a measure of building condition and not a grade. Two schools with close screening scores can sit several places apart. The need-first rules have no screening score; they order schools by school need.",
      where: "List score column, breakdown total, export",
    },
    rank: {
      technical: "Point rank",
      label: "Place in the list",
      line: "Where the school falls in the suggested order under the chosen rule; 1st comes first.",
      help: `Places in the list count among ${completePhrase(c, reads)}. Filtering the list does not change them. When two schools tie, the school name decides, in alphabetical order.`,
      where: "List rank column, school panel, map numerals, export",
    },
    rank_range: {
      technical: "Rank bounds (best and worst rank)",
      label: "Possible places in the list",
      line: "The highest and lowest places in the list a school could take when its air-quality reading is missing.",
      help: `${groupsSentence(c, reads)} Rather than guess a missing reading, the tool works out the highest and lowest places in the list each school that shows a range could take among ${orderedPhrase(c)}. The list shows them where they would sit if their missing readings added nothing to their screening score.`,
      where: "List rank column for range schools, school panel, map range mark",
    },
    cohort_complete: {
      technical: `Complete-primary cohort${schoolsSuffix(c, "complete")}`,
      label: `${capitalise(everyInput(reads))}${countSuffix(c, "complete")}`,
      line: groupsSentence(c, reads),
      help: "These schools have a single place in the list under this rule. To compare two rules, use the schools both put in order.",
      where: "Scope line above the list, rank sentences, comparison sentences",
    },
    cohort_ranked: {
      technical: `Condition-eligible cohort${schoolsSuffix(c, "ranked")}`,
      label: `Can be put in order${countSuffix(c, "ranked")}`,
      line: groupsSentence(c, reads),
      help: `${GROUPS_MEANING} Schools that show a range have possible places among ${orderedPhrase(c)} instead of a single place.`,
      where: "Ranked tab count, range sentences, export scope",
    },
    queue: {
      technical: `Verification queue${schoolsSuffix(c, "queue")}`,
      label: `Schools with incomplete records${countSuffix(c, "queue")}`,
      line: "Schools whose records lack details that school need uses, so they cannot be put in order yet.",
      help: "Each one shows what is missing, and whether a detail is blank or recorded as a value the calculation cannot use, such as 0 classrooms. Having no place in the list yet does not mean a school's need is low. They are listed by province, district and school name. This is not an order of priority.",
      where: "Queue tab, queue map marks, school panel for these schools",
    },
    not_placed: {
      technical: "Queue status",
      label: "Cannot be put in order yet",
      line: "The status of a school whose record is incomplete, so it has no place in the list yet.",
      help: "It changes once the missing details are checked and completed. It says nothing about the school's need.",
      where: "List rows, map tooltips and school panel for schools with incomplete records",
    },
    missing_classrooms: {
      technical: "Gate failure: permanent_classroom_deficit",
      label: "Classroom count blank, or recorded as 0",
      line: "The record leaves a classroom count blank or gives 0 classrooms; either way it needs checking, and the share built of permanent materials cannot be worked out.",
      help: "Most of these records give 0 classrooms in total. The screen does not guess why.",
      where: "Missing-evidence filter and grouping",
    },
    missing_housing: {
      technical: "Gate failure: teacher_housing_deficit",
      label: "Teacher or house count blank, or recorded as 0",
      line: "The record leaves the number of teachers or teacher houses blank, or gives 0 teachers; either way it needs checking.",
      help: "Teacher housing compares houses with teachers, so both counts are needed.",
      where: "Missing-evidence filter and grouping",
    },
    missing_facilities: {
      technical: "Gate failure: facility_presence_deficit",
      label: "Facility counts blank",
      line: "The record leaves some of the six facility counts blank.",
      help: "Missing facility types are worked out from all six counts, so a blank count cannot be treated as none.",
      where: "Missing-evidence filter and grouping",
    },
    missing_services: {
      technical: "Gate failure: service_deficit",
      label: "Power or water source blank",
      line: "The record leaves the power source or the water source blank.",
      help: "The power and water part needs both sources.",
      where: "Missing-evidence filter and grouping",
    },
    missing_all_but_remoteness: {
      technical: "Locality-only record",
      label: "Only remoteness recorded",
      line: "The record gives the remoteness category and nothing else about the school's classrooms, teachers, facilities, power or water.",
      help: [
        known(c, "remotenessOnly") && known(c, "queue")
          ? `${formatCount(c.remotenessOnly)} of the ${formatCount(c.queue)} incomplete records are like this.`
          : "",
        "Classroom, teacher, housing, facility, power and water details are all blank.",
      ]
        .filter(Boolean)
        .join(" "),
      where: "Missing-evidence filter and grouping, missing sentences",
    },
    unknown_value: {
      technical: "Missing value (null)",
      label: "Not recorded",
      line: "The source left this blank; the tool does not fill it in or count it as 0.",
      help: "Use it only when the source cell is blank. A blank stays blank everywhere: on screen, in the screening score and in the export.",
      where: 'Breakdown rows and condition table, only for blank source cells (missingValueKind "blank")',
    },
    unusable_value: {
      technical: "Recorded but unusable value (zero denominator)",
      label: "Recorded, but cannot be used",
      line: "The source gives a value the calculation cannot use, such as 0 classrooms in total, so the part it feeds cannot be worked out.",
      help: "The value stays as recorded. It is a reason to check the record, not a finding about the school.",
      where: 'Breakdown rows (missingValueKind "unusable")',
    },
    not_calculable: {
      technical: "Not calculable from incomplete parts",
      label: "Cannot be worked out",
      line: "A figure built from other parts cannot be calculated because one of those parts is blank or unusable.",
      help: "School need for every school with an incomplete record reads this way, with the specific reason. It is never shown as not recorded or as 0.",
      where: 'School need row for schools with incomplete records (missingValueKind "not_calculable")',
    },
    list_order: {
      technical: "Lower-score placement",
      label: "Where range schools sit",
      line: `In the list, ${rangePhrase(c)} ${oneRange(c) ? "sits where it would if its" : "sit where they would if their"} missing readings added nothing to ${theirScore(c)} screening score.`,
      help: "The study uses this as its main order. Listing them where air quality adds as much as it can is available as a labelled sensitivity check.",
      where: "Note under the scope line, sensitivity toggle",
    },
    shortlist_size: {
      technical: "Top K",
      label: "Length of the top list",
      line: "How many schools from the top of the list go into the top list you download.",
      help: "Choose 10, 20 or 30. Range schools are added after the top list when their highest possible place falls inside it, and they are marked as ranges.",
      where: "Export sheet, top-of-list markers",
    },
    filters: {
      technical: "Display filter",
      label: "Show only",
      line: "Narrows what the list and map show; places in the list stay as they are.",
      help: "Filtering by province or remoteness hides other schools but never recomputes the scale or the places.",
      where: "Filter control and chips, filter note",
    },
    layers: {
      technical: "Map layers",
      label: "Map layers",
      line: "Choose what the map draws: schools, boundaries and context layers.",
      help: "Layers change the picture only. They do not change any screening score or place in the list.",
      where: "Layers button on the map bar",
    },
    briefing_stops: {
      technical: "Briefing stops",
      label: "Saved views for meetings",
      line: "Views you save to walk a meeting through, one at a time.",
      help: "A saved view keeps the rule, the list and its tab, the selected school, the grouping, the method details and the comparison, and opens as a link. The map position is not kept.",
      where: "Map bar, saved views for meetings",
    },
    compare: {
      technical: "Rule comparison",
      label: "Compare rules",
      line: "Shows which schools join or leave the top of the list when you switch rules, and how far places move.",
      help: "Comparisons come from the study's recorded comparison. Each one ranks the schools that both rules put in order, so the group can differ from one pair of rules to the next.",
      where: "What changed block, compare mode",
    },
    export: {
      technical: "Shortlist export",
      label: "Download the top list",
      line: "A spreadsheet of the top list with every input and how it was made.",
      help: "The file keeps exact school names, full-precision values, blanks as blanks, and the method record at the top, so someone else can rebuild the same list.",
      where: "Export button, export sheet",
    },
    manifest: {
      technical: "Manifest",
      label: "Method record",
      line: "The lines at the top of the download that say exactly how the list was made.",
      help: "It names the rule and its shares, which schools the places count among, how ties are broken, the scaling used and the fingerprints of the source files.",
      where: "Export sheet, top of the downloaded file",
    },
    tie_rule: {
      technical: "Tie-break by school name",
      label: "Ties",
      line: "When two schools are exactly level, the one whose name comes first alphabetically goes first.",
      help: "Rounded figures on screen never change the order; the tool compares full-precision values.",
      where: "Provenance strip, method record",
    },
    persistent_flag: {
      technical: "Persistent candidate (circulated 0.80 list)",
      label: "Often in the top 20 when shares change (paper's main rule only)",
      line: "In the paper's test that changed the factors' shares at random, it stayed in the top 20 in at least 8 of every 10 tries, in each of the three test settings.",
      help: `That test used the paper's main rule, which includes urgency, and has not been redone for the proposed revision, so the flag shows only under the combined-factors rule with urgency (S).${flaggedLine(c)}`,
      where: "School panel under S only",
    },
    shortlist: {
      technical: "Shortlist (top K)",
      label: "Top list",
      line: "The first 10, 20 or 30 schools in the list under the chosen rule, which you can download.",
      help: "It is a list to start inspections from, not a selection or an approval.",
      where: "Export sheet, top-of-list markers, guides",
    },
    mark_dot: {
      technical: "Point-rank mark",
      label: "Filled dot",
      line: "A school with one place in the list; the darker the blue, the earlier it comes.",
      help: numbersHelp(c, reads),
      where: "Map and key",
    },
    mark_range: {
      technical: "Interval mark",
      label: "Ring with a centre dot",
      line: "A school with a range of possible places in the list, because its air-quality reading is missing.",
      help: "It has none of the blue used for places in the list, so it never looks like it has one place.",
      where: "Map and key",
    },
    mark_ring: {
      technical: "Queue mark",
      label: "Empty ring",
      line: "A school whose record is incomplete, so it has no place in the list yet.",
      help: "It is drawn smaller than every other mark, so it never looks like a school low in the list.",
      where: "Map and key",
    },
  } satisfies Record<string, Term>;
  return terms;
}

export type TermKey = keyof ReturnType<typeof buildTerms>;
export const TERMS = buildTerms();

export const term = (key: TermKey): Term => {
  const t = TERMS[key];
  if (!t) throw new Error(`Unknown term: ${key}`);
  return t;
};
