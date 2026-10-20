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

/**
 * Which cohort a rank counts, as a code to branch on. The label beside it is for reading, never for parsing.
 * A point rank counts the schools complete under its rule; rank bounds count the eligible schools.
 */
const scopeCode = looseEnum<"complete_under_rule" | "eligible">();

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

const rawListedRow = obj({
  cohort,
  point_rank: pointRank,
  rank_bounds: rankBounds,
  school: schoolIdentity,
  /**
   * Whether the school stayed in the top 20 when the paper changed the factors' shares at random: true or false,
   * or null when it was not in that experiment. Present only in the list of the circulated rule, `additive_u`,
   * because the experiment included urgency. It must never be shown for another rule.
   */
  persistent_candidate: optional(nullable(bool)),
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
  manifest: obj({
    rule_label: str,
    point_rank_scope: str,
    point_rank_scope_code: scopeCode,
    point_rank_count: int,
    rank_bounds_scope: str,
    rank_bounds_scope_code: scopeCode,
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
      point_rank_scope_code: scopeCode,
      rank_bounds_scope: str,
      rank_bounds_scope_code: scopeCode,
      result: detailResult,
      /** As on a listed row: only the circulated rule's entry has it. */
      persistent_candidate: optional(nullable(bool)),
    })
  ),
});
export type SchoolDetailResponse = Infer<typeof schoolDetailResponse>;

/** The stored inputs of every school of an input version, as `inputs` is in a school's detail. */
export const inputsResponse = obj({
  input_version: str,
  input_sha256: str,
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
