/**
 * How the method details change the map's marks: layers turned off, schools outside the filters faded, and in
 * compare mode each dot coloured by how far it moved, larger when it is in either rule's top k.
 * The map draws from this; the key reads the same colours.
 */
import type { SchoolKey } from "../types";
import type { MapLayer } from "../workspace/state";
import { type MoveEdges, moveStep } from "./compare";

/** Blue up, grey same, orange down, three steps each; listed as the key shows them, the largest move up first. */
export const MOVE_HEX = [
  "#1f5fa8",
  "#2f7fd6",
  "#86b2e6",
  "#b4b2aa",
  "#e99a6c",
  "#d8662a",
  "#a9481a",
] as const;

/** The colour of a move of `d` places (below zero is up the list). */
export function moveHex(d: number, edges: MoveEdges): string {
  return MOVE_HEX[3 + moveStep(d, edges)];
}

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
