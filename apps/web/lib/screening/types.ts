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
  failParse,
  int,
  list,
  looseEnum,
  nullable,
  num,
  obj,
  oneOf,
  refine,
  str,
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
  latitude: nullable(num),
  longitude: nullable(num),
});
export type SchoolIdentity = Infer<typeof schoolIdentity>;

const pointRank = obj({ rank: nullable(int), scope: str, count: int });
const rankBounds = obj({ best: nullable(int), worst: nullable(int), scope: str, count: int });
const cohort = oneOf("complete", "interval", "verification_queue");
export type Cohort = Infer<typeof cohort>;

const rawListedRow = obj({
  cohort,
  point_rank: pointRank,
  rank_bounds: rankBounds,
  school: schoolIdentity,
});
type RawRow = Infer<typeof rawListedRow>;

type RankedPoint = { rank: number; scope: string; count: number };
type RankedBounds = { best: number; worst: number; scope: string; count: number };
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
  point_rank: { rank: null; scope: string; count: number };
  rank_bounds: RankedBounds;
};
/** A school held for verification: not in the ordered list at all. */
export type QueuedRow = RowBase & {
  cohort: "verification_queue";
  point_rank: { rank: null; scope: string; count: number };
  rank_bounds: { best: null; worst: null; scope: string; count: number };
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
  manifest: obj({
    rule_label: str,
    point_rank_scope: str,
    point_rank_count: int,
    rank_bounds_scope: str,
    rank_bounds_count: int,
  }),
  rows: list(listedRow),
});
export type ResultsResponse = Infer<typeof resultsResponse>;

const detailResult = obj({ cohort, point_rank: pointRank, rank_bounds: rankBounds });

export const schoolDetailResponse = obj({
  input_version: str,
  school: schoolIdentity,
  rules: list(
    obj({
      rule: obj({ rule_id: RuleId, label: str }),
      point_rank_scope: str,
      rank_bounds_scope: str,
      result: detailResult,
    })
  ),
});
export type SchoolDetailResponse = Infer<typeof schoolDetailResponse>;

const compared = obj({ school: schoolIdentity, rank_a: int, rank_b: int, rank_scope: str });

export const compareResponse = obj({
  input_version: str,
  run_a: run,
  run_b: run,
  common_cohort_scope: str,
  common_cohort_count: int,
  ranks: list(compared),
  entrants: list(compared),
  exits: list(compared),
  /** Schools the comparison leaves out, because they are not complete under both rules. */
  excluded_schools: list(obj({ school: schoolIdentity, reason: str })),
});
export type CompareResponse = Infer<typeof compareResponse>;
