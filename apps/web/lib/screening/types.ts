/**
 * The screening API's responses, written once as schemas (see schema.ts) that give the types and check every
 * response where it enters the app. Mirrors `services/api/app/models/screening.py`; when that file changes, this
 * is the one module to change.
 *
 * Only the fields the page reads are parsed, so an API change to anything else cannot blank the screen, and a
 * field is added here in the change that first uses it. Enums the page does not branch on accept any string.
 *
 * A listed row is parsed into one of three shapes by cohort, so a complete school always has a single place,
 * an interval school always has a range of places, and a queued school has neither.
 */
import {
  type Infer,
  type Schema,
  bool,
  branded,
  dict,
  failParse,
  int,
  list,
  looseEnum,
  nonEmptyList,
  nullable,
  num,
  obj,
  oneOf,
  optional,
  refine,
  scalar,
  str,
  tolerant,
} from "./schema";

export const SchoolKey = branded<"SchoolKey">();
export type SchoolKey = Infer<typeof SchoolKey>;
export const RuleId = branded<"RuleId">();
export type RuleId = Infer<typeof RuleId>;

/** Where a list puts its interval schools: at the lower or the upper end of their range of scores. */
export type Placement = "lower" | "upper";

/** The page splits rules by this: the primary rules sit side by side, the rest behind "Other rules". */
const policyRole = looseEnum<
  "primary" | "strict_alternative" | "policy_sensitivity" | "conventional_reference"
>();

// ---------------------------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------------------------

const rule = obj({
  rule_id: RuleId,
  label: str,
  policy_role: policyRole,
  uses_urgency: bool,
  /** The rule as the paper writes it, and each input's share as a fraction and a number; method details only. */
  formula: str,
  weights: list(obj({ component: str, fraction: str, value: num })),
});
export type Rule = Infer<typeof rule>;

export const rulesResponse = obj({
  default_rule_id: RuleId,
  rules: list(rule),
});
export type RulesResponse = Infer<typeof rulesResponse>;

// ---------------------------------------------------------------------------------------------
// One school under one rule.
// ---------------------------------------------------------------------------------------------

const schoolIdentity = obj({
  school_key: SchoolKey,
  source_school_name: str,
  province: nullable(str),
  district: nullable(str),
  locality: nullable(str),
  latitude: nullable(num),
  longitude: nullable(num),
});
export type SchoolIdentity = Infer<typeof schoolIdentity>;

/**
 * Which cohort a rank counts, as a code to branch on. The label beside it is for reading, never for parsing.
 * A point rank counts the schools complete under its rule; rank bounds count the eligible schools.
 */
const scopeCode = looseEnum<"complete_under_rule" | "eligible" | "common_complete_cohort">();

const pointRank = obj({ rank: nullable(int), scope: str, scope_code: scopeCode, count: int });
const rankBounds = obj({
  best: nullable(int),
  worst: nullable(int),
  scope: str,
  scope_code: scopeCode,
  count: int,
});
const cohort = oneOf("complete", "interval", "verification_queue");
export type Cohort = Infer<typeof cohort>;

/** The rule's inputs for one school, each from 0 to 1. A rule that does not read urgency has no `U` key at all. */
const components = obj({
  N: nullable(num),
  A: nullable(num),
  R: nullable(num),
  Q: nullable(num),
  E: nullable(num),
  L: nullable(num),
  U: optional(nullable(num)),
});
const scores = obj({
  lower: nullable(num),
  /** The highest screening score a school could have: the lower one for a school with every input. */
  upper: nullable(num),
  point: nullable(num),
  sort_key_primary: nullable(num),
});
const needParts = obj({
  permanent_classroom_deficit: nullable(num),
  teacher_housing_deficit: nullable(num),
  facility_presence_deficit: nullable(num),
  service_deficit: nullable(num),
  locality_disadvantage: nullable(num),
});
const areaParts = obj({
  progression_g10_deficit: nullable(num),
  progression_g12_deficit: nullable(num),
  secondary_participation_deficit: nullable(num),
  activity_scale_deficit: nullable(num),
  conflict_exposure: nullable(num),
  female_disadvantage: nullable(num),
});

const maximumTerm = obj({
  /**
   * The factors that tie for the largest value: school need, district context and, where the rule reads it, urgency.
   * A largest term always has a source, so an empty list is a malformed response and is rejected here.
   */
  attained_by: nonEmptyList(oneOf("N", "A", "U")),
  value: num,
  share: num,
  /** What the largest factor adds to the score: `share` times `value`. */
  contribution: num,
});

/** What the engine produced for one school under one rule, as a listed row and a school's detail both carry it. */
const resultParts = {
  cohort,
  /** Why the engine holds the school back under this rule; empty unless the school is in the queue. */
  gate_failures: list(str),
  components,
  scores,
  need_parts: needParts,
  area_parts: areaParts,
  /** What each component adds to the score under this rule; empty for a school held back. */
  contributions: list(obj({ component: str, lower: num, upper: num, weight: optional(num) })),
  need_part_contributions: nullable(needParts),
  /** The share a largest-factor rule gives to its largest factor; null under every other rule. */
  maximum_term: nullable(maximumTerm),
  point_rank: pointRank,
  rank_bounds: rankBounds,
};

const rawListedRow = obj({
  ...resultParts,
  school: schoolIdentity,
  /**
   * Whether the school stayed in the top 20 when the paper changed the factors' shares at random: true or false,
   * or null when it was not in that experiment. Present only in the list of the circulated rule, `additive_u`,
   * because the experiment included urgency. It must never be shown for another rule.
   */
  persistent_candidate: optional(nullable(bool)),
  /**
   * True for a persistent school whose lowest frequency is less than one standard error above the threshold, so
   * "only just above the line" can be said from data. Same presence rule as `persistent_candidate`.
   */
  threshold_adjacent: optional(nullable(bool)),
});
type RawRow = Infer<typeof rawListedRow>;

type Scope = { scope: string; scope_code: string; count: number };
type RankedPoint = Scope & { rank: number };
type RankedBounds = Scope & { best: number; worst: number };
type RowBase = Omit<RawRow, "cohort" | "point_rank" | "rank_bounds">;

/** A complete school: one exact place among the complete schools. */
export type CompleteRow = RowBase & {
  cohort: "complete";
  point_rank: RankedPoint;
  rank_bounds: RankedBounds;
};
/** An interval school: no exact place, only the best and worst place it could take. */
export type IntervalRow = RowBase & {
  cohort: "interval";
  point_rank: Scope & { rank: null };
  rank_bounds: RankedBounds;
};
/** A school held for verification: not in the ordered list at all. */
export type QueuedRow = RowBase & {
  cohort: "verification_queue";
  point_rank: Scope & { rank: null };
  rank_bounds: Scope & { best: null; worst: null };
};
export type ListedRow = CompleteRow | IntervalRow | QueuedRow;

/** Rejects a row whose cohort contradicts its ranks, so no later code has to wonder. */
const listedRow: Schema<ListedRow> = refine(rawListedRow, (row, path): ListedRow => {
  const { point_rank: point, rank_bounds: bounds } = row;
  switch (row.cohort) {
    case "complete":
      if (point.rank !== null && bounds.best !== null && bounds.worst !== null) return row as CompleteRow;
      break;
    case "interval":
      if (point.rank === null && bounds.best !== null && bounds.worst !== null) return row as IntervalRow;
      break;
    case "verification_queue":
      if (point.rank === null && bounds.best === null && bounds.worst === null) return row as QueuedRow;
      break;
  }
  return failParse(path, `ranks that agree with cohort "${row.cohort}"`, {
    point_rank: point.rank,
    best: bounds.best,
    worst: bounds.worst,
  });
});

// ---------------------------------------------------------------------------------------------
// Endpoint responses.
// ---------------------------------------------------------------------------------------------

/** What the page names the list by. It comes from the run behind the rows, never from what was asked for. */
const run = obj({ rule_id: RuleId, input_version: str, package_version: str });

export const resultsResponse = obj({
  run,
  total_schools: int,
  returned_schools: int,
  manifest: obj({
    /** How many schools of each group the run holds, whatever the filter: `records`, `complete`, ... */
    cohort_counts: dict(int),
    rule_label: str,
    point_rank_scope: str,
    point_rank_scope_code: scopeCode,
    point_rank_count: int,
    rank_bounds_scope: str,
    rank_bounds_scope_code: scopeCode,
    rank_bounds_count: int,
  }),
  rows: list(listedRow),
  /**
   * Where the persistence flag came from, in the circulated rule's list only; null when the version has none. Only
   * the standard error is read: it is the margin inside which a school counts as only just above the line. The block
   * adds a margin to a sentence, so a change to it reads as absent instead of blanking the list.
   */
  persistence: tolerant(nullable(obj({ standard_error: num }))),
});
export type ResultsResponse = Infer<typeof resultsResponse>;

const detailResult = obj(resultParts);
export type DetailResult = Infer<typeof detailResult>;

export const schoolDetailResponse = obj({
  input_version: str,
  school: schoolIdentity,
  /** The school's stored inputs as the record gave them; a blank cell is null. */
  inputs: dict(nullable(scalar)),
  rules: list(
    obj({
      rule: obj({ rule_id: RuleId, label: str }),
      point_rank_scope: str,
      point_rank_scope_code: scopeCode,
      rank_bounds_scope: str,
      rank_bounds_scope_code: scopeCode,
      result: detailResult,
      /** As on a listed row: only the circulated rule's entry has these three. */
      persistent_candidate: optional(nullable(bool)),
      threshold_adjacent: optional(nullable(bool)),
    })
  ),
});
export type SchoolDetailResponse = Infer<typeof schoolDetailResponse>;

/** The stored inputs of every school of an input version, as `inputs` is in a school's detail. */
export const inputsResponse = obj({
  input_version: str,
  schools: list(
    obj({
      school_key: SchoolKey,
      source_school_name: str,
      /** One entry per input field: a number, a text, or null when the reading is unknown. */
      inputs: dict(nullable(scalar)),
    })
  ),
});
export type InputsResponse = Infer<typeof inputsResponse>;

/** A school's possible places under one rule of a comparison; null ends where that rule has no result for it. */
const intervalBounds = obj({ rank_best: nullable(int), rank_worst: nullable(int) });
const compared = obj({
  school: schoolIdentity,
  rank_a: int,
  rank_b: int,
  rank_scope: str,
  rank_scope_code: scopeCode,
});
const topChange = obj({
  status: str,
  school: schoolIdentity,
  rank_a: int,
  rank_b: int,
  rank_scope: str,
  rank_scope_code: scopeCode,
});

export const compareResponse = obj({
  input_version: str,
  run_a: run,
  run_b: run,
  common_cohort_scope: str,
  common_cohort_scope_code: scopeCode,
  common_cohort_count: int,
  metrics: obj({
    n: int,
    median_absolute_rank_shift: nullable(num),
    maximum_absolute_rank_shift: nullable(num),
    top_k: list(obj({ k: int, overlap: int })),
  }),
  ranks: list(compared),
  entrants: list(topChange),
  exits: list(topChange),
  /** Schools the comparison leaves out, because they are not complete under both rules. */
  excluded_schools: list(obj({ school: schoolIdentity, reason: str })),
  /** The range schools, with their possible places under each rule; compare mode shows them beside the chart. */
  interval_schools: optional(
    list(obj({ school: schoolIdentity, under_a: intervalBounds, under_b: intervalBounds }))
  ),
});
export type CompareResponse = Infer<typeof compareResponse>;
