/**
 * Maps the screening API's responses into the records the copy reads, so the copy functions stay the prototype's.
 *
 * Every mapping is a rename or a regrouping; no figure is computed, filled in or guessed. Where the API cannot
 * supply something the copy reads, the function says so (a `ParseError` for a broken response, an absent key for
 * an unknown count) rather than inventing it.
 *
 * Two things differ between the API and the study the copy was written for:
 *  - A school's group is relative to a rule: a school can lack a reading that one rule reads and another does not.
 *    Each function takes the rule being shown and a school's group is its group under that rule. Its results under
 *    the other rules are kept as the API gave them, so a sentence about another rule reads that rule's own place
 *    or range. A result for a school held for verification under that rule is left out.
 *  - The API names why it holds a school back (`gate_failures`). The reasons about the stored counts and sources
 *    name no part, so the need parts a record cannot give are read from the need parts that are blank, as the
 *    study listed them. The other reasons (negative count, district context, reach, urgency) are carried as sent.
 *
 * Input shapes are in `wire.ts`. Parse a response with them before it reaches these functions.
 */
import { ParseError } from "../schema";

import type {
  AreaParts,
  CopyCohort,
  CopyComponents,
  CopyCondition,
  CopyResult,
  CopyRuleId,
  CopySchool,
  CountBag,
  GateKey,
  MissingEnv,
  NeedField,
  NeedParts,
  PairwiseRow,
  PlacedSchool,
  RecordedContribution,
  ResultsByRule,
  Top20Change,
} from "./model";
import { OTHER_GATES } from "./gates";
import { isCopyRuleId } from "./rules";
import type {
  WireCohort,
  WireCompare,
  WireResults,
  WireRow,
  WireSchoolDetail,
  WireSchoolResult,
} from "./wire";

const COHORT: Record<WireCohort, CopyCohort> = {
  complete: "complete",
  interval: "interval",
  verification_queue: "queue",
};

const NEED_FIELD_ORDER: readonly NeedField[] = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
];

const isNeedFirstRule = (id: CopyRuleId): boolean => id === "need_first_u" || id === "need_first_no_u";

/** The API labels the scope of the bounds "eligible (N)"; the copy asks only whether they count every school that can be put in order. */
const ELIGIBLE_SCOPE = /^eligible \(\d+\)$/;

function viewRuleOf(response: WireResults): CopyRuleId {
  const id = response.run.rule_id;
  if (!isCopyRuleId(id))
    throw new ParseError(`run.rule_id: the copy has no words for the rule ${JSON.stringify(id)}`);
  return id;
}

function toResult(
  id: CopyRuleId,
  r: Pick<WireSchoolResult, "scores" | "point_rank" | "rank_bounds">
): CopyResult {
  const base = {
    rank_complete120: r.point_rank.rank,
    rank_best: r.rank_bounds.best,
    rank_worst: r.rank_bounds.worst,
    rank_bounds_scope: ELIGIBLE_SCOPE.test(r.rank_bounds.scope) ? "eligible124" : null,
  };
  // Under the need-first rules the primary sort key is school need and the score is the secondary one.
  return isNeedFirstRule(id)
    ? { ...base, school_need: r.scores.sort_key_primary, secondary_score_lower: r.scores.lower }
    : { ...base, score_point: r.scores.point };
}

/** A figure the API must give for the copy to say anything true; its absence is a broken response. */
function present<T>(value: T | null | undefined, path: string): T {
  if (value == null)
    throw new ParseError(`${path}: expected a value, got ${value === null ? "null" : "undefined"}`);
  return value;
}

/* ----------------------------------------------------------------- one school */

type Inputs = WireSchoolDetail["inputs"];

function numberInput(inputs: Inputs, key: string): number | null {
  if (!(key in inputs)) throw new ParseError(`inputs.${key}: expected a number or null, got undefined`);
  const v = inputs[key];
  if (v === null || typeof v === "number") return v;
  throw new ParseError(`inputs.${key}: expected a number or null, got string ${JSON.stringify(v)}`);
}

function textInput(inputs: Inputs, key: string): string | null {
  if (!(key in inputs)) throw new ParseError(`inputs.${key}: expected a string or null, got undefined`);
  const v = inputs[key];
  if (v === null || typeof v === "string") return v;
  throw new ParseError(`inputs.${key}: expected a string or null, got number ${v}`);
}

function conditionFrom(inputs: Inputs): CopyCondition {
  return {
    teachers: numberInput(inputs, "teachers"),
    classrooms_total: numberInput(inputs, "total_classrooms"),
    classrooms_permanent: numberInput(inputs, "permanent_classrooms"),
    teacher_houses: numberInput(inputs, "teacher_houses"),
    libraries: numberInput(inputs, "libraries"),
    workshops: numberInput(inputs, "workshops"),
    practical_skills: numberInput(inputs, "practical_skills_buildings"),
    home_economics: numberInput(inputs, "home_economics_buildings"),
    computer_labs: numberInput(inputs, "computer_labs"),
    specialized_classrooms: numberInput(inputs, "specialized_classrooms"),
    power_source: textInput(inputs, "power_source"),
    water_source: textInput(inputs, "water_source"),
  };
}

function areaPartsFrom(a: WireSchoolResult["area_parts"]): AreaParts {
  return {
    progression10_deficit: a.progression_g10_deficit,
    progression12_deficit: a.progression_g12_deficit,
    secondary_participation_deficit: a.secondary_participation_deficit,
    activity_deficit: a.activity_scale_deficit,
    conflict_exposure: a.conflict_exposure,
    female_disadvantage: a.female_disadvantage,
  };
}

/** What the two combined-factors rules recorded for each input. Complete and interval schools always have all of it. */
function recordedContribution(id: "additive_u" | "additive_no_u", r: WireSchoolResult): RecordedContribution {
  const at = (component: string) => {
    const found = r.contributions.find((c) => c.component === component);
    if (!found) throw new ParseError(`rules.${id}.result.contributions: no entry for component ${component}`);
    return found;
  };
  const parts = present(r.need_part_contributions, `rules.${id}.result.need_part_contributions`);
  const part = (field: NeedField) =>
    present(parts[field], `rules.${id}.result.need_part_contributions.${field}`);
  const q = at("Q"),
    e = at("E"),
    l = at("L");
  return {
    components: {
      permanent_classroom_deficit: part("permanent_classroom_deficit"),
      teacher_housing_deficit: part("teacher_housing_deficit"),
      facility_presence_deficit: part("facility_presence_deficit"),
      service_deficit: part("service_deficit"),
      locality_disadvantage: part("locality_disadvantage"),
      area: at("A").lower,
      ...(id === "additive_u" ? { urgency: at("U").lower } : {}),
      reach: at("R").lower,
      aqi_lower: q.lower,
      aqi_upper: q.upper,
      emissions_lower: e.lower,
      emissions_upper: e.upper,
      land_lower: l.lower,
      land_upper: l.upper,
    },
  };
}

/**
 * Why a school is held back: the need parts that are blank (the API's reasons about counts and sources name none),
 * then the other reasons it sent, in the engine's order. A reason this copy has no words for is left out.
 */
function gateFailuresOf(sent: readonly string[], needParts: NeedParts): GateKey[] {
  return [
    ...NEED_FIELD_ORDER.filter((f) => needParts[f] == null),
    ...OTHER_GATES.filter((g) => sent.includes(g)),
  ];
}

/**
 * One school with its whole record, as it reads under `view`: the rule the screen is showing.
 * `detail` is the `/schools/by-key` response, which carries the stored inputs and the result under every rule.
 */
export function schoolFromDetail(detail: WireSchoolDetail, view: CopyRuleId): CopySchool {
  const entries = new Map<CopyRuleId, WireSchoolResult>();
  for (const entry of detail.rules)
    if (isCopyRuleId(entry.rule.rule_id)) entries.set(entry.rule.rule_id, entry.result);
  const shown = entries.get(view);
  if (!shown) throw new ParseError(`rules: the school has no result under ${view}`);
  const cohort = COHORT[shown.cohort];

  const results: ResultsByRule = {};
  const contributions: NonNullable<CopySchool["contributions"]> = {};
  if (cohort !== "queue") {
    for (const [id, r] of entries) if (r.cohort !== "verification_queue") results[id] = toResult(id, r);
    for (const id of ["additive_u", "additive_no_u"] as const) {
      const r = entries.get(id);
      if (r && r.cohort !== "verification_queue") contributions[id] = recordedContribution(id, r);
    }
  }

  // The components do not depend on the rule; urgency is missing from the rules that leave it out.
  const urgency = [shown, ...entries.values()].map((r) => r.components.U).find((u) => u !== undefined);
  const { N, A, R, Q, E, L } = shown.components;
  const components: CopyComponents = { N, A, U: urgency ?? null, R, Q, E, L };

  const needParts: NeedParts = shown.need_parts;
  const raw = {
    Q_raw: numberInput(detail.inputs, "aqi_p95_selected"),
    E_raw: numberInput(detail.inputs, "emissions_co2e_100yr_10km_tonnes"),
    L_raw: numberInput(detail.inputs, "water_flooded_vegetation_fraction_500m"),
  };

  return {
    id: detail.school.school_key,
    name: detail.school.source_school_name,
    province: detail.school.province,
    district: detail.school.district,
    locality: detail.school.locality,
    cohort,
    // The engine also nulls a reading that is recorded but out of range, so a missing reading is read off the
    // components, as the list route reads it, and not off the raw value.
    missing_env: { aqi: Q === null, emissions: E === null, land: L === null },
    condition: conditionFrom(detail.inputs),
    need_parts: needParts,
    area_parts: areaPartsFrom(shown.area_parts),
    components,
    raw,
    gate_failures: cohort === "queue" ? gateFailuresOf(shown.gate_failures, needParts) : [],
    results,
    contributions,
  };
}

/* ------------------------------------------------------------------- the list */

/**
 * The schools of a list, for the place sentences, headlines, ties and names. The first response is the rule being
 * shown and sets each school's group. Pass more responses (other rules, unfiltered) to give each school a result
 * under those rules too, which `comparisonSentence` needs for the top 10, and `rangeComparisonSentence` for a pair.
 *
 * A list row carries no stored inputs, so these are not whole records: the reasons and the missing-detail notes
 * need `schoolFromDetail`. Which readings are missing is read from the components, which are blank for them.
 */
/** A school of a list: what the place sentences read, and which readings are blank. */
export type ListedSchool = PlacedSchool & { readonly missing_env: MissingEnv };

export function placedFromResults(first: WireResults, ...others: WireResults[]): ListedSchool[] {
  const view = viewRuleOf(first);
  const index = (response: WireResults): [CopyRuleId, Map<string, WireRow>] => [
    viewRuleOf(response),
    new Map(response.rows.map((row) => [row.school.school_key, row])),
  ];
  const more = others.map(index);
  return first.rows.map((row) => {
    const cohort = COHORT[row.cohort];
    const results: ResultsByRule = {};
    if (cohort !== "queue") {
      results[view] = toResult(view, row);
      for (const [id, rows] of more) {
        const other = rows.get(row.school.school_key);
        if (other && other.cohort !== "verification_queue") results[id] = toResult(id, other);
      }
    }
    return {
      id: row.school.school_key,
      name: row.school.source_school_name,
      province: row.school.province,
      district: row.school.district,
      cohort,
      results,
      missing_env: {
        aqi: row.components.Q === null,
        emissions: row.components.E === null,
        land: row.components.L === null,
      },
    };
  });
}

/**
 * The counts a list response can give. A count it cannot give is left out, and the sentence that would state it
 * is written without the number:
 *  - the group sizes come from the run's manifest, so a filtered list still counts every school;
 *  - how many schools have no air-quality reading, and how many have an urgency value of 0, come from the rows and
 *    only when the list is unfiltered and (for urgency) the rule gives the value;
 *  - how many have no nearby emissions, how many records give only a remoteness category, and how many carry the
 *    circulated candidate flag need the stored inputs of every school, which no list response holds.
 * Counts belong to the run: bind one `copyFor` per rule being shown.
 */
export function countsFromResults(response: WireResults): CountBag {
  const cc = response.manifest.cohort_counts;
  const out: Record<string, number> = {};
  const { records, complete, interval, verification_queue: queue } = cc;
  if (records !== undefined) out.all = records;
  if (complete !== undefined) out.complete = complete;
  if (interval !== undefined) out.range = interval;
  if (queue !== undefined) out.queue = queue;
  if (complete !== undefined && interval !== undefined) out.ranked = complete + interval;

  if (
    response.returned_schools === response.total_schools &&
    response.rows.length === response.total_schools
  ) {
    const rows = response.rows;
    out.airMissing = rows.filter((r) => r.cohort !== "verification_queue" && r.components.Q === null).length;
    if (rows.every((r) => r.components.U !== undefined)) {
      out.urgencyZero = rows.filter((r) => r.components.U === 0).length;
    }
  }
  return out;
}

/* ----------------------------------------------------------------- comparison */

const TOP_SIZES = [10, 20, 30, 40] as const;

/**
 * The study's recorded comparison of two rules, from `/compare`, in the rows `comparisonSentence` reads.
 * Both arrays are empty when the response holds no usable comparison (no common school, or a rule the copy has
 * no words for), so the sentences say none is recorded. A response without one of the four top-list sizes is broken.
 */
export function pairwiseFromCompare(compare: WireCompare): {
  pairwise: PairwiseRow[];
  top20Changes: Top20Change[];
} {
  const none = { pairwise: [], top20Changes: [] };
  const left = compare.run_a.rule_id;
  const right = compare.run_b.rule_id;
  if (!isCopyRuleId(left) || !isCopyRuleId(right)) return none;
  const {
    n,
    median_absolute_rank_shift: median,
    maximum_absolute_rank_shift: maximum,
    top_k: topK,
  } = compare.metrics;
  if (n === 0 || median === null || maximum === null) return none;
  const overlap = (k: number): number => {
    const found = topK.find((t) => t.k === k);
    if (!found) throw new ParseError(`metrics.top_k: no entry for the top ${k}`);
    return found.overlap;
  };
  const [o10, o20, o30, o40] = TOP_SIZES.map(overlap);
  const change = (c: WireCompare["entrants"][number]): Top20Change => ({
    left_rule: left,
    right_rule: right,
    status: c.status,
    left_rank: c.rank_a,
    right_rank: c.rank_b,
    "School Name": c.school.source_school_name,
  });
  return {
    pairwise: [
      {
        left_rule: left,
        right_rule: right,
        n,
        top10_overlap: o10,
        top20_overlap: o20,
        top30_overlap: o30,
        top40_overlap: o40,
        median_absolute_rank_shift: median,
        maximum_absolute_rank_shift: maximum,
      },
    ],
    top20Changes: [...compare.exits.map(change), ...compare.entrants.map(change)],
  };
}
