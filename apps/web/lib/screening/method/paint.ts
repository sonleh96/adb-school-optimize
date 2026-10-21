/**
 * How the method details change the map's marks: layers turned off, schools outside the filters faded, and in
 * compare mode each dot coloured by how far it moved (`moves.ts`), larger when it is in either rule's top k.
 * The map draws from this. Only types and the plain default live here, so the map's code carries nothing else.
 */
import type { SchoolKey } from "../types";
import type { MapLayer } from "../workspace/state";

export interface Move {
  readonly hex: string;
  /** In the top k under either rule: drawn larger. */
  readonly top: boolean;
}

export interface MarkPaint {
  readonly hidden: readonly MapLayer[];
  /** Schools outside the filters, drawn faint; null when no filter is set. */
  readonly faint: ReadonlySet<SchoolKey> | null;
  /** Compare mode's colour for each school both rules put in order; null outside compare mode. */
  readonly moves: ReadonlyMap<SchoolKey, Move> | null;
}

export const NO_PAINT: MarkPaint = Object.freeze({ hidden: [], faint: null, moves: null });
