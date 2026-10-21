/** The map's paint for the method details, worked out from the list on screen, the filters and the comparison. */
import type { ListedRow, SchoolKey } from "../types";
import type { MapLayer } from "../workspace/state";
import type { Compared, MoveEdges } from "./compare";
import { type Filters, admits, filtering } from "./filters";
import { OUTSIDE_HEX, moveHex } from "./moves";
import type { MarkPaint, Move } from "./paint";

/** Layers off, schools outside the filters faint, and compare mode's move colours. */
export function paintFor(input: {
  hide: readonly MapLayer[];
  rows: readonly ListedRow[];
  filters: Filters;
  compared: Compared | null;
  /** The edges that sort a move into its bin, from the method words. */
  edges: MoveEdges;
}): MarkPaint {
  const { filters, compared } = input;
  const faint = filtering(filters)
    ? new Set(input.rows.filter((row) => !admits(row, filters)).map((row) => row.school.school_key))
    : null;
  let moves: Map<SchoolKey, Move> | null = null;
  if (compared) {
    moves = new Map(
      compared.rows.map((r) => [
        r.key,
        { hex: moveHex(r.d, input.edges), top: r.a <= compared.k || r.b <= compared.k },
      ])
    );
    // A school with a single place outside the group both rules put in order takes the neutral colour, never the
    // place ramp, so the map's colours mean one thing.
    for (const row of input.rows)
      if (row.cohort === "complete" && !moves.has(row.school.school_key))
        moves.set(row.school.school_key, { hex: OUTSIDE_HEX, top: false });
  }
  return { hidden: input.hide, faint, moves };
}
