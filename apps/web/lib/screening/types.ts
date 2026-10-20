/**
 * The screening API's responses, written once as schemas (see schema.ts) that give the types and check every
 * response where it enters the app. Mirrors `services/api/app/models/screening.py`; when that file changes, this
 * is the one module to change.
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
  nullable,
  num,
  obj,
  oneOf,
  optional,
  refine,
  scalar,
  str,
} from "./schema";

export const SchoolKey = branded<"SchoolKey">();
export type SchoolKey = Infer<typeof SchoolKey>;
export const RuleId = branded<"RuleId">();
export type RuleId = Infer<typeof RuleId>;

const component = oneOf("N", "A", "U", "R", "Q", "E", "L");
export type Component = Infer<typeof component>;
const provenance = oneOf("circulated_paper", "proposed_follow_up_pending_author_review");
export type Provenance = Infer<typeof provenance>;
const policyRole = oneOf("primary", "strict_alternative", "policy_sensitivity", "conventional_reference");
export type PolicyRole = Infer<typeof policyRole>;
const gateFailure = oneOf(
  "missing_stock_field",
  "negative_stock_value",
  "nonpositive_denominator",
  "unrecognized_service_coding",
  "unrecognized_locality",
  "unresolved_area_context",
  "unresolved_reach",
  "urgency_unknown"
);
export type GateFailure = Infer<typeof gateFailure>;
export const placement = oneOf("lower", "upper");
export type Placement = Infer<typeof placement>;

// ---------------------------------------------------------------------------------------------
// Rules and input versions.
// ---------------------------------------------------------------------------------------------

const weight = obj({ component, fraction: str, value: num });

const rule = obj({
  rule_id: RuleId,
  label: str,
  provenance,
  policy_role: policyRole,
  score_kind: str,
  formula: str,
  weights: list(weight),
  primary_sort_key: nullable(component),
  maximum_components: list(component),
  maximum_share: str,
  uses_urgency: bool,
  is_default: bool,
  available_input_versions: list(str),
});
export type Rule = Infer<typeof rule>;

const inputVersion = obj({
  input_version: str,
  description: nullable(str),
  input_sha256: str,
  record_count: int,
  created_at: str,
  is_default: bool,
  rules_available: list(str),
});

export const rulesResponse = obj({
  default_rule_id: RuleId,
  rules: list(rule),
  input_versions: list(inputVersion),
});
export type RulesResponse = Infer<typeof rulesResponse>;

// ---------------------------------------------------------------------------------------------
// A run and its manifest.
// ---------------------------------------------------------------------------------------------

const run = obj({
  run_id: str,
  input_version: str,
  rule_id: RuleId,
  input_sha256: str,
  anchors_sha256: str,
  package_version: str,
  created_at: str,
});

const anchor = obj({
  component,
  name: str,
  source_field: str,
  transformation: str,
  n_records: int,
  n_valid: int,
  p05: nullable(num),
  p95: nullable(num),
  degenerate: bool,
});

const manifest = obj({
  rule_id: RuleId,
  rule_label: str,
  provenance,
  policy_role: policyRole,
  rule_formula: str,
  score_kind: str,
  uses_urgency: bool,
  weights: list(weight),
  primary_sort_key: nullable(component),
  sort_columns: list(str),
  maximum_components: list(component),
  maximum_share: str,
  anchors: list(anchor),
  degenerate_anchors: list(str),
  anchors_sha256: str,
  tie_rule: str,
  point_rank_scope: str,
  point_rank_count: int,
  rank_bounds_scope: str,
  rank_bounds_count: int,
  cohort_counts: dict(int),
  input_sha256: str,
  package_version: str,
});
export type Manifest = Infer<typeof manifest>;

// ---------------------------------------------------------------------------------------------
// One school under one rule.
// ---------------------------------------------------------------------------------------------

const schoolIdentity = obj({
  school_key: SchoolKey,
  school_id: nullable(str),
  source_school_name: str,
  province: nullable(str),
  district: nullable(str),
  locality: nullable(str),
  latitude: nullable(num),
  longitude: nullable(num),
});
export type SchoolIdentity = Infer<typeof schoolIdentity>;

const optionalScore = nullable(num);
// `U` is absent under rules that do not use urgency.
const components = obj({
  N: optionalScore,
  A: optionalScore,
  U: optional(optionalScore),
  R: optionalScore,
  Q: optionalScore,
  E: optionalScore,
  L: optionalScore,
});

const needParts = obj({
  permanent_classroom_deficit: optionalScore,
  teacher_housing_deficit: optionalScore,
  facility_presence_deficit: optionalScore,
  service_deficit: optionalScore,
  locality_disadvantage: optionalScore,
});

const areaParts = obj({
  progression_g10_deficit: optionalScore,
  progression_g12_deficit: optionalScore,
  secondary_participation_deficit: optionalScore,
  activity_scale_deficit: optionalScore,
  conflict_exposure: optionalScore,
  female_disadvantage: optionalScore,
});

const contribution = obj({ component, weight: num, lower: num, upper: num });

const maximumTerm = obj({
  share: num,
  value: num,
  attained_by: list(component),
  contribution: num,
});

const scores = obj({
  lower: optionalScore,
  upper: optionalScore,
  point: optionalScore,
  sort_key_primary: optionalScore,
});

const pointRank = obj({ rank: nullable(int), scope: str, count: int });
const rankBounds = obj({ best: nullable(int), worst: nullable(int), scope: str, count: int });
const cohort = oneOf("complete", "interval", "verification_queue");
export type Cohort = Infer<typeof cohort>;

/** The members of one school's result. The API's listed row extends it with an order, a placement and the school. */
const resultShape = {
  cohort,
  gate_failures: list(gateFailure),
  components,
  need_parts: needParts,
  area_parts: areaParts,
  contributions: list(contribution),
  need_part_contributions: nullable(needParts),
  maximum_term: nullable(maximumTerm),
  scores,
  point_rank: pointRank,
  rank_bounds: rankBounds,
};
const schoolResult = obj(resultShape);
export type SchoolResult = Infer<typeof schoolResult>;

const rowPlacement = oneOf("point", "lower", "upper", "queue");

const rawListedRow = obj({
  ...resultShape,
  display_order: int,
  placement: rowPlacement,
  school: schoolIdentity,
});

type RawRow = Infer<typeof rawListedRow>;
type RankedPoint = { rank: number; scope: string; count: number };
type RankedBounds = { best: number; worst: number; scope: string; count: number };

/** A complete school: one exact place among the complete schools. */
export type CompleteRow = Omit<RawRow, "cohort" | "placement" | "point_rank" | "rank_bounds"> & {
  cohort: "complete";
  placement: "point";
  point_rank: RankedPoint;
  rank_bounds: RankedBounds;
};
/** An interval school: no exact place, only the best and worst place it could take. */
export type IntervalRow = Omit<RawRow, "cohort" | "placement" | "point_rank" | "rank_bounds"> & {
  cohort: "interval";
  placement: "lower" | "upper";
  point_rank: { rank: null; scope: string; count: number };
  rank_bounds: RankedBounds;
};
/** A school held for verification: not in the ordered list at all. */
export type QueuedRow = Omit<RawRow, "cohort" | "placement" | "point_rank" | "rank_bounds"> & {
  cohort: "verification_queue";
  placement: "queue";
  point_rank: { rank: null; scope: string; count: number };
  rank_bounds: { best: null; worst: null; scope: string; count: number };
};
export type ListedRow = CompleteRow | IntervalRow | QueuedRow;

/** Rejects a row whose cohort contradicts its ranks, so no later code has to wonder. */
const listedRow: Schema<ListedRow> = refine(rawListedRow, (row, path): ListedRow => {
  const { point_rank: point, rank_bounds: bounds } = row;
  switch (row.cohort) {
    case "complete":
      if (row.placement === "point" && point.rank !== null && bounds.best !== null && bounds.worst !== null) {
        return row as CompleteRow;
      }
      break;
    case "interval":
      if (
        (row.placement === "lower" || row.placement === "upper") &&
        point.rank === null &&
        bounds.best !== null &&
        bounds.worst !== null
      ) {
        return row as IntervalRow;
      }
      break;
    case "verification_queue":
      if (row.placement === "queue" && point.rank === null && bounds.best === null && bounds.worst === null) {
        return row as QueuedRow;
      }
      break;
  }
  return failParse(path, `ranks that agree with cohort "${row.cohort}"`, {
    placement: row.placement,
    point_rank: point.rank,
    best: bounds.best,
    worst: bounds.worst,
  });
});

// ---------------------------------------------------------------------------------------------
// Endpoint responses.
// ---------------------------------------------------------------------------------------------

export const resultsResponse = obj({
  run,
  manifest,
  placement,
  filters: obj({ province: nullable(str), district: nullable(str) }),
  filters_note: str,
  total_schools: int,
  returned_schools: int,
  rows: list(listedRow),
});
export type ResultsResponse = Infer<typeof resultsResponse>;

const ruleSummary = obj({
  rule_id: RuleId,
  label: str,
  provenance,
  policy_role: policyRole,
  score_kind: str,
  uses_urgency: bool,
});

export const schoolDetailResponse = obj({
  input_version: str,
  input_sha256: str,
  school: schoolIdentity,
  inputs: dict(nullable(scalar)),
  rules: list(
    obj({
      rule: ruleSummary,
      run,
      point_rank_scope: str,
      rank_bounds_scope: str,
      result: schoolResult,
    })
  ),
});
export type SchoolDetailResponse = Infer<typeof schoolDetailResponse>;

const intervalBounds = obj({
  cohort,
  score_lower: nullable(num),
  score_upper: nullable(num),
  rank_best: nullable(int),
  rank_worst: nullable(int),
  rank_bounds_scope: str,
});

const topChange = obj({
  status: str,
  school: schoolIdentity,
  rank_a: int,
  rank_b: int,
  score_a: num,
  score_b: num,
});

export const compareResponse = obj({
  input_version: str,
  input_sha256: str,
  run_a: run,
  run_b: run,
  common_cohort_scope: str,
  common_cohort_count: int,
  metrics: obj({
    n: int,
    spearman_rank: nullable(num),
    kendall_tau: nullable(num),
    pairwise_discordance: nullable(num),
    median_absolute_rank_shift: nullable(num),
    maximum_absolute_rank_shift: nullable(num),
    top_k: list(obj({ k: int, overlap: int, jaccard: nullable(num), size_a: int, size_b: int })),
  }),
  ranks: list(obj({ school: schoolIdentity, rank_a: int, rank_b: int })),
  entrants: list(topChange),
  exits: list(topChange),
  interval_schools: list(obj({ school: schoolIdentity, under_a: intervalBounds, under_b: intervalBounds })),
});
export type CompareResponse = Infer<typeof compareResponse>;
