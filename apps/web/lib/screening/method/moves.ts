/** Compare mode's colours for a move, shared by the map, the chart, the card and the key. */
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

/**
 * A school with a single place under the rule shown that the two rules do not both put in order has no move: one
 * neutral colour, apart from the move colours, which the key names.
 */
export const OUTSIDE_HEX = "#d6d3cb";

/** The colour of a move of `d` places (below zero is up the list). */
export function moveHex(d: number, edges: MoveEdges): string {
  return MOVE_HEX[3 + moveStep(d, edges)];
}
