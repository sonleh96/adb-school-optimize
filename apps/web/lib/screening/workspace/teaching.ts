/**
 * Teaching schools: the schools an example sentence names, chosen from the loaded data by the role they play, never
 * by name or id, so the screen works on any data and no real school is written into the code (robustness R13).
 */
import type { CopyResult, CopyRuleId, PlacedSchool } from "../copy";

const bounded = (r: CopyResult | null | undefined) =>
  !!r && Number.isInteger(r.rank_best) && Number.isInteger(r.rank_worst);
const placed = (r: CopyResult | null | undefined) => !!r && Number.isInteger(r.rank_complete120);

/**
 * The example for What changed between two rules: the first school in the list that shows a range under both (the
 * comparison is about what leaving a reading out can do to such a school), otherwise the first with a single place
 * under both, otherwise none.
 */
export function exampleSchool<S extends PlacedSchool>(
  schools: readonly S[],
  a: CopyRuleId,
  b: CopyRuleId
): S | null {
  const under = (s: S, id: CopyRuleId) => s.results?.[id] ?? null;
  return (
    schools.find((s) => s.cohort === "interval" && bounded(under(s, a)) && bounded(under(s, b))) ??
    schools.find((s) => s.cohort === "complete" && placed(under(s, a)) && placed(under(s, b))) ??
    null
  );
}
