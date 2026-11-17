/**
 * Teaching schools: the schools an example sentence names, chosen from the loaded data by the role they play, never
 * by name or id, so the screen works on any data and no real school is written into the code (robustness R13).
 */
import type { CopyResult, CopyRuleId, PlacedSchool } from "../copy";

type Bounded = CopyResult & { rank_best: number; rank_worst: number };
type Placed = CopyResult & { rank_complete120: number };
const bounded = (r: CopyResult | null | undefined): r is Bounded =>
  !!r && Number.isInteger(r.rank_best) && Number.isInteger(r.rank_worst);
const placed = (r: CopyResult | null | undefined): r is Placed => !!r && Number.isInteger(r.rank_complete120);

/** The first of `schools` with the largest `move`, among those `move` gives a number for. */
function mostMoved<S>(schools: readonly S[], move: (s: S) => number | null): S | null {
  let best: S | null = null;
  let most = -1;
  for (const school of schools) {
    const m = move(school);
    if (m !== null && m > most) {
      best = school;
      most = m;
    }
  }
  return best;
}

/**
 * The example for What changed between two rules: the school that shows a range under both whose possible places
 * move most (the comparison is about what leaving a reading out can do to such a school; a range that does not move
 * teaches nothing), otherwise the school with a single place under both that moves most, otherwise none. Ties go to
 * the school that comes first in the list.
 */
export function exampleSchool<S extends PlacedSchool>(
  schools: readonly S[],
  a: CopyRuleId,
  b: CopyRuleId
): S | null {
  const under = (s: S, id: CopyRuleId) => s.results?.[id] ?? null;
  const range = mostMoved(
    schools.filter((s) => s.cohort === "interval"),
    (s) => {
      const ra = under(s, a);
      const rb = under(s, b);
      return bounded(ra) && bounded(rb)
        ? Math.abs(ra.rank_best - rb.rank_best) + Math.abs(ra.rank_worst - rb.rank_worst)
        : null;
    }
  );
  if (range) return range;
  return mostMoved(
    schools.filter((s) => s.cohort === "complete"),
    (s) => {
      const ra = under(s, a);
      const rb = under(s, b);
      return placed(ra) && placed(rb) ? Math.abs(ra.rank_complete120 - rb.rank_complete120) : null;
    }
  );
}
