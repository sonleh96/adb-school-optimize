/**
 * The reasons the engine holds a school back for (`GateFailure` in the scoring package), as the copy words them.
 * A need part is named by the part that cannot be used; the others are named by the reason itself.
 */
import type { GateKey, NeedField, OtherGate } from "./model";

export const NEED_GATES: readonly NeedField[] = [
  "permanent_classroom_deficit",
  "teacher_housing_deficit",
  "facility_presence_deficit",
  "service_deficit",
  "locality_disadvantage",
];

/** In the order the engine reports them. */
export const OTHER_GATES: readonly OtherGate[] = [
  "negative_stock_value",
  "unresolved_area_context",
  "unresolved_reach",
  "urgency_unknown",
];

export const isNeedGate = (g: string): g is NeedField => (NEED_GATES as readonly string[]).includes(g);
export const isOtherGate = (g: string): g is OtherGate => (OTHER_GATES as readonly string[]).includes(g);
export const isGateKey = (g: string): g is GateKey => isNeedGate(g) || isOtherGate(g);
