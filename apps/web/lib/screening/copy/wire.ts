/**
 * The fields of the screening API's responses that the copy reads, written as schemas.
 *
 * `lib/screening/types.ts` parses only what the page reads today, and the copy reads more: the stored inputs, the
 * need and area parts, the contributions and the scores. These schemas parse the same responses (the keys not
 * named here are ignored) so the adapter takes checked data. When the page's parsers grow these fields, this file
 * can be replaced by them; the adapter reads only the types below.
 */
import { type Infer, dict, int, list, nullable, num, obj, oneOf, optional, scalar, str } from "../schema";

const cohort = oneOf("complete", "interval", "verification_queue");
export type WireCohort = Infer<typeof cohort>;

const identity = obj({
  school_key: str,
  source_school_name: str,
  province: nullable(str),
  district: nullable(str),
  locality: nullable(str),
});

const pointRank = obj({ rank: nullable(int), scope: str, count: int });
const rankBounds = obj({ best: nullable(int), worst: nullable(int), scope: str, count: int });
const scores = obj({
  lower: nullable(num),
  upper: nullable(num),
  point: nullable(num),
  sort_key_primary: nullable(num),
});

/** There is no `U` key at all for a rule that does not read urgency. */
const components = obj({
  N: nullable(num),
  A: nullable(num),
  R: nullable(num),
  Q: nullable(num),
  E: nullable(num),
  L: nullable(num),
  U: optional(nullable(num)),
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

const contribution = obj({ component: str, lower: num, upper: num });

// ---------------------------------------------------------------------------------------------
// /results: one rule, every school, in the shape the list needs.
// ---------------------------------------------------------------------------------------------

const listedRow = obj({
  cohort,
  components,
  scores,
  point_rank: pointRank,
  rank_bounds: rankBounds,
  school: identity,
});
export type WireRow = Infer<typeof listedRow>;

export const wireResults = obj({
  run: obj({ rule_id: str }),
  manifest: obj({ cohort_counts: dict(int) }),
  total_schools: int,
  returned_schools: int,
  rows: list(listedRow),
});
export type WireResults = Infer<typeof wireResults>;

// ---------------------------------------------------------------------------------------------
// /schools/by-key: one school under every rule that has a run, with its stored raw inputs.
// ---------------------------------------------------------------------------------------------

const schoolResult = obj({
  cohort,
  /** Why the engine holds the school back under this rule. Empty unless the school is in the queue. */
  gate_failures: list(str),
  components,
  need_parts: needParts,
  area_parts: areaParts,
  contributions: list(contribution),
  need_part_contributions: nullable(needParts),
  scores,
  point_rank: pointRank,
  rank_bounds: rankBounds,
});
export type WireSchoolResult = Infer<typeof schoolResult>;

export const wireSchoolDetail = obj({
  school: identity,
  inputs: dict(nullable(scalar)),
  rules: list(obj({ rule: obj({ rule_id: str }), result: schoolResult })),
});
export type WireSchoolDetail = Infer<typeof wireSchoolDetail>;

// ---------------------------------------------------------------------------------------------
// /compare: two rules on the schools both order.
// ---------------------------------------------------------------------------------------------

const topChange = obj({
  status: str,
  school: obj({ source_school_name: str }),
  rank_a: int,
  rank_b: int,
});

export const wireCompare = obj({
  run_a: obj({ rule_id: str }),
  run_b: obj({ rule_id: str }),
  metrics: obj({
    n: int,
    median_absolute_rank_shift: nullable(num),
    maximum_absolute_rank_shift: nullable(num),
    top_k: list(obj({ k: int, overlap: int })),
  }),
  entrants: list(topChange),
  exits: list(topChange),
});
export type WireCompare = Infer<typeof wireCompare>;
