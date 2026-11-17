/**
 * What puts a school in the top 20, as the explore page's drivers section draws it from one rule's list: each school's
 * score split into what each part adds to it, and the score gap between each pair of neighbouring places.
 *
 * The parts and their order come from the rule's own description, through the diagram of each part's share
 * (`scoreTreeOf`), so a bar names and orders its parts as that diagram does: the five parts of school need, then the
 * other inputs in the rule's order. What each part adds is the engine's own figure: a part of school need adds its value
 * times a fifth of school need's share (`need_part_contributions`), any other input its value times its share
 * (`contributions`). Nothing here holds a share.
 *
 * Only a rule whose score is its parts added up gets bars. A need-first rule orders by school need and uses the rest only
 * to separate exact ties, and a largest-factor rule adds a share of whichever factor is larger, so neither score is a
 * sum of its parts. A list whose parts do not add up to its scores gets no bars either: a bar that does not end at the
 * school's score would say something false.
 *
 * Two figures less than `SAME_SCORE` apart are the same figure, as the card's tie note reads them: two neighbours that
 * close are tied, two parts that close are level, and a bar's parts add up to its score within it.
 *
 * Pure, so the section, its table and the tests read the same figures.
 */
import { SAME_SCORE } from "@/lib/screening/copy/rank";
import { type OrderedRow, type Place, placeOf } from "@/lib/screening/list";
import {
  type Input,
  NEED_PART_TERM,
  type NeedPart,
  type Part,
  scoreTreeOf,
} from "@/lib/screening/score-tree";
import type { ListedRow, Rule } from "@/lib/screening/types";

/** The places the question is about. */
export const TOP = 20;
/** The gaps run this many places past the top 20, so the edge of the top 20 has neighbours on both sides. */
export const PAST = 2;

/** A gap under this is a close call: the tool writes scores to three decimal places, where the two can read the same. */
export const CLOSE_CALL = 0.001;

/** One part of a bar: a part of school need, or another input the rule adds. */
export type Piece = NeedPart | Exclude<Input, "N">;
export const isNeedPart = (piece: Piece): piece is NeedPart => piece in NEED_PART_TERM;

/** What one part adds to a school's score. The two ends differ only where a figure is not recorded. */
export interface Segment {
  readonly piece: Piece;
  readonly lower: number;
  readonly upper: number;
}

/** One school's bar. */
export interface Bar {
  readonly id: string;
  /** One place, or the range of places a school with a figure not recorded can take. */
  readonly place: Place;
  /** The score, or the range of scores: the two are equal for a school with every figure recorded. */
  readonly lower: number;
  readonly upper: number;
  /** Every part, in the diagram's order, with what it adds. */
  readonly segments: readonly Segment[];
}

/** How two neighbouring scores compare: the same score, a close call under 0.001 apart, or further apart. */
export type GapKind = "tie" | "close" | "clear";

/** A school with one place, as one end of a gap. */
export interface Neighbour {
  readonly id: string;
  readonly rank: number;
  readonly score: number;
}

/** The gap between two neighbouring places. */
export interface Gap {
  readonly above: Neighbour;
  readonly below: Neighbour;
  /** How far the score above is ahead of the one below. */
  readonly size: number;
  readonly kind: GapKind;
}

/**
 * The marked school outside the top 20, with its bar. The bar is null when its parts do not add up to its score: then
 * only its bar is left out, and the top 20 are still drawn.
 */
export interface Outside {
  readonly id: string;
  readonly place: Place;
  readonly bar: Bar | null;
}

export type Drivers =
  /** The rule's score is its parts added up: the bars of the top 20, and the gaps to the 22nd place. */
  | {
      readonly kind: "parts";
      /** The parts in the diagram's order: the legend's order and the table's columns. */
      readonly pieces: readonly Piece[];
      /** The schools with a place in the top 20 and those whose range of places reaches it, in the list's order. */
      readonly bars: readonly Bar[];
      /** The marked school when it is in the list but not in the top 20, or null. */
      readonly outside: Outside | null;
      /** Each pair of neighbouring places from the 1st to the 22nd, among the schools with one place. */
      readonly gaps: readonly Gap[];
    }
  /** School need sets the order, and the other inputs only separate exact ties. */
  | { readonly kind: "need-first" }
  /** The score adds a share of whichever of these factors is larger for the school. */
  | { readonly kind: "largest"; readonly of: readonly Input[] }
  /** The rule does not say how it combines its inputs, or the parts do not add up to the scores. */
  | { readonly kind: "unreadable" };

const isOrdered = (row: ListedRow): row is OrderedRow => row.cohort !== "verification_queue";
const inTop = (row: OrderedRow): boolean =>
  row.cohort === "complete" ? row.point_rank.rank <= TOP : row.rank_bounds.best <= TOP;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** What each part adds to a school's score, or null when a part is missing or the parts do not add up to the score. */
function barOf(row: OrderedRow, pieces: readonly Piece[]): Bar | null {
  const segments: Segment[] = [];
  for (const piece of pieces) {
    if (isNeedPart(piece)) {
      const adds = row.need_part_contributions?.[piece];
      if (adds == null) return null;
      segments.push({ piece, lower: adds, upper: adds });
    } else {
      const found = row.contributions.find((c) => c.component === piece);
      if (!found || found.upper < found.lower) return null;
      segments.push({ piece, lower: found.lower, upper: found.upper });
    }
  }
  const { lower, upper } = row.scores;
  if (lower === null || upper === null) return null;
  const addsUp =
    Math.abs(sum(segments.map((s) => s.lower)) - lower) < SAME_SCORE &&
    Math.abs(sum(segments.map((s) => s.upper)) - upper) < SAME_SCORE;
  return addsUp ? { id: row.school.school_key, place: placeOf(row), lower, upper, segments } : null;
}

export const gapKind = (size: number): GapKind =>
  size < SAME_SCORE ? "tie" : size < CLOSE_CALL ? "close" : "clear";

/** The gaps between neighbouring places, from the 1st to the 22nd, among the schools of the list with one place. */
function gapsOf(rows: readonly OrderedRow[]): Gap[] {
  const byRank = new Map<number, Neighbour>();
  for (const row of rows)
    if (row.cohort === "complete" && row.point_rank.rank <= TOP + PAST && row.scores.point !== null)
      byRank.set(row.point_rank.rank, {
        id: row.school.school_key,
        rank: row.point_rank.rank,
        score: row.scores.point,
      });
  const gaps: Gap[] = [];
  for (let rank = 1; rank < TOP + PAST; rank++) {
    const above = byRank.get(rank);
    const below = byRank.get(rank + 1);
    if (!above || !below) continue;
    const size = above.score - below.score;
    gaps.push({ above, below, size, kind: gapKind(size) });
  }
  return gaps;
}

/** The drivers section's figures for one rule's list, with the school `marked` drawn even outside the top 20. */
export function driversOf(rule: Rule, rows: readonly ListedRow[], marked: string | null): Drivers {
  const tree = scoreTreeOf(rule);
  if (!tree) return { kind: "unreadable" };
  if (tree.kind === "need-first") return { kind: "need-first" };
  const largest = tree.branches
    .map((branch) => branch.part)
    .find((part): part is Extract<Part, { kind: "largest" }> => part.kind === "largest");
  if (largest) return { kind: "largest", of: largest.of };
  // A rule that adds up its parts: school need's branch holds its five parts, each other input is one part.
  const pieces = tree.branches.flatMap((branch): Piece[] => {
    if (branch.part.kind !== "input") return [];
    if (branch.children.length > 0)
      return branch.children.flatMap((child) => (child.part.kind === "need-part" ? [child.part.part] : []));
    const input = branch.part.input;
    return input === "N" ? [] : [input];
  });

  const ordered = rows.filter(isOrdered);
  const bars = ordered.filter(inTop).map((row) => barOf(row, pieces));
  if (bars.some((bar) => bar === null)) return { kind: "unreadable" };
  const outsideRow =
    marked === null ? undefined : ordered.find((r) => r.school.school_key === marked && !inTop(r));
  const outside = outsideRow
    ? { id: outsideRow.school.school_key, place: placeOf(outsideRow), bar: barOf(outsideRow, pieces) }
    : null;
  return { kind: "parts", pieces, bars: bars as Bar[], outside, gaps: gapsOf(ordered) };
}

/**
 * Where a bar's parts are drawn, on the score's scale from 0: every recorded part in the diagram's order, so the solid
 * bar ends at the lower score; then each part whose figure is not recorded, hollow, as far as it could add, so the bar
 * ends at the upper score. A part that adds nothing draws nothing.
 */
export interface Drawn {
  readonly piece: Piece;
  readonly from: number;
  readonly to: number;
  readonly recorded: boolean;
}

export function drawnOf(bar: Bar): Drawn[] {
  const out: Drawn[] = [];
  let at = 0;
  for (const s of bar.segments) {
    if (s.lower <= 0) continue;
    out.push({ piece: s.piece, from: at, to: at + s.lower, recorded: true });
    at += s.lower;
  }
  for (const s of bar.segments) {
    if (s.upper - s.lower <= 0) continue;
    out.push({ piece: s.piece, from: at, to: at + s.upper - s.lower, recorded: false });
    at += s.upper - s.lower;
  }
  return out;
}

/** The scale every bar sits on: from 0 to the largest score, rounded up to a tenth, with a tick at each tenth. */
export function scaleOf(bars: readonly Bar[]): { readonly max: number; readonly ticks: readonly number[] } {
  const largest = Math.max(0, ...bars.map((bar) => bar.upper));
  const tenths = Math.max(1, Math.ceil(largest * 10 - SAME_SCORE));
  return { max: tenths / 10, ticks: Array.from({ length: tenths + 1 }, (_, i) => i / 10) };
}

/**
 * How many bars have the five parts of school need adding more than every other input together, the other inputs
 * taken at the most they could add, so the count holds whatever a figure not recorded turns out to be.
 */
export function needLeads(bars: readonly Bar[]): number {
  return bars.filter((bar) => {
    const need = sum(bar.segments.filter((s) => isNeedPart(s.piece)).map((s) => s.lower));
    const others = sum(bar.segments.filter((s) => !isNeedPart(s.piece)).map((s) => s.upper));
    return need > others;
  }).length;
}

/**
 * The recorded parts that add the most to one bar's score, in the diagram's order: every part within `SAME_SCORE` of
 * the largest, so two parts that only float rounding split are level. Empty when no part adds anything.
 */
export function largestOf(bar: Bar): readonly Segment[] {
  const top = Math.max(0, ...bar.segments.map((s) => s.lower));
  return top <= 0 ? [] : bar.segments.filter((s) => top - s.lower < SAME_SCORE);
}

/**
 * The part that is the largest recorded part of the most bars, with how many; several parts when they share the
 * count, in the diagram's order. A bar whose largest part ties counts for each. Null when no bar has a part above 0.
 */
export function largestParts(
  bars: readonly Bar[],
  pieces: readonly Piece[]
): { readonly pieces: readonly Piece[]; readonly count: number } | null {
  const counts = new Map<Piece, number>();
  for (const bar of bars) for (const s of largestOf(bar)) counts.set(s.piece, (counts.get(s.piece) ?? 0) + 1);
  const count = Math.max(0, ...counts.values());
  return count === 0 ? null : { pieces: pieces.filter((p) => counts.get(p) === count), count };
}

/** The gap at the edge of the top 20, between the 20th and the 21st, or null when the list has no 21st. */
export const edgeOf = (gaps: readonly Gap[]): Gap | null =>
  gaps.find((gap) => gap.above.rank === TOP) ?? null;
