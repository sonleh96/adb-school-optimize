/** A school's score range as the card shows it. */
import type { CopyResult } from "../copy";

/**
 * The lowest and highest screening score of a school that shows a range, as the engine states them. The page does
 * not rebuild the range from the contributions: under a rule that adds a share that is not among them the sum is not
 * the score, and a sum off by a rounding error is a number the engine never gave.
 */
export function scoreRangeOf(
  result: Pick<CopyResult, "score_lower" | "score_upper"> | null | undefined
): [number, number] | null {
  const lower = result?.score_lower;
  const upper = result?.score_upper;
  if (typeof lower !== "number" || typeof upper !== "number" || lower > upper) return null;
  return [lower, upper];
}
