/**
 * Comparing two rules, from the study's recorded comparison. These functions take the comparison as an argument
 * because this module never fetches. `urgencyReassurance` and the list statements answer "which list should I use".
 */
import { countsFrom, rangePhrase, theSchools, theirScore } from "./counts";
import { displayName, formatCount, lowerFirst, ordinal, plural } from "./format";
import type { ComparisonData, CopyRuleId, PairwiseRow, PlacedSchool, Top20Change } from "./model";
import { distinctName, hasPlace, resultFor } from "./rank";
import { rule } from "./rules";
import { joinSegments, nameList, nameSegment, seg, textOf, type Segments } from "./segments";

export const findPair = (
  pairwise: readonly PairwiseRow[],
  ruleA: string,
  ruleB: string
): PairwiseRow | undefined =>
  pairwise.find(
    (p) =>
      (p.left_rule === ruleA && p.right_rule === ruleB) || (p.left_rule === ruleB && p.right_rule === ruleA)
  );

type TopSize = 10 | 20 | 30 | 40;
const overlapAt = (row: PairwiseRow, k: TopSize): number | undefined =>
  ({ 10: row.top10_overlap, 20: row.top20_overlap, 30: row.top30_overlap, 40: row.top40_overlap })[k];

// One framing for agreement everywhere: "The same 20 schools make the top 20 under both, and the same 40 make the top 40."
// base: the top-list length to lead with (10 or 20). both: how to name the pair, such as "under both".
export const pairSize = (row: PairwiseRow): number | null =>
  Number.isInteger(row.n) ? (row.n as number) : null;
export const pairPhrase = (row: PairwiseRow): string =>
  theSchools({ n: pairSize(row) ?? undefined }, "n", "with every input recorded");
export function agreementSentence(row: PairwiseRow, base: 10 | 20, both: string): string {
  const n = pairSize(row);
  if (n != null && n <= base) {
    return n === 1
      ? `The one school with every input recorded is in the top ${base} ${both}.`
      : `All ${formatCount(n)} schools with every input recorded are in the top ${base} ${both}.`;
  }
  const shared = overlapAt(row, base);
  const lead =
    shared === base
      ? `The same ${base} schools make the top ${base} ${both}`
      : `${shared} of the top ${base} schools are the same ${both}`;
  const larger = ([10, 20, 30, 40] as const).filter((k) => k > base && overlapAt(row, k) === k);
  if (shared === base && larger.length) {
    const k = Math.max(...larger);
    return `${lead}, and the same ${k} make the top ${k}.`;
  }
  return `${lead}.`;
}

interface TopChange {
  readonly name: string;
  readonly enters: boolean;
  readonly from: number | null | undefined;
  readonly to: number | null | undefined;
}

// A school as the comparison names it: told apart from a twin whose name differs only in spacing, and "Unnamed
// school" for a blank name. A change that carries no id can only be named as the source wrote it.
function changeName(c: Top20Change, schools: readonly PlacedSchool[] | undefined): string {
  const known = c.school_key === undefined ? undefined : schools?.find((s) => s.id === c.school_key);
  return known ? distinctName(known, schools) : displayName({ name: c["School Name"] });
}

// Schools that join and leave the top k when switching from ruleA to ruleB.
function topChanges(
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  data: ComparisonData & { top20Changes: readonly Top20Change[] },
  row: PairwiseRow,
  k: 10 | 20
): TopChange[] | null {
  if (k === 20) {
    const flip = row.left_rule !== ruleA;
    return data.top20Changes
      .filter((c) => c.left_rule === row.left_rule && c.right_rule === row.right_rule)
      .map((c) => ({
        name: changeName(c, data.schools),
        enters: flip ? c.status === "exit" : c.status === "entrant",
        from: flip ? c.right_rank : c.left_rank,
        to: flip ? c.left_rank : c.right_rank,
      }));
  }
  if (!data.schools) return null;
  // The recorded comparison ranks the schools that have a place under both rules, each by its own order. A school
  // with no place under either rule is not in it, so it can neither join nor leave.
  const both = data.schools.flatMap((s) => {
    const a = resultFor(s, ruleA),
      b = resultFor(s, ruleB);
    return hasPlace(a) && hasPlace(b) ? [{ s, a: a.rank_complete120, b: b.rank_complete120 }] : [];
  });
  const rankIn = (own: (x: (typeof both)[number]) => number): Map<string, number> =>
    new Map([...both].sort((x, y) => own(x) - own(y)).map((x, i) => [x.s.id, i + 1]));
  const ra = rankIn((x) => x.a),
    rb = rankIn((x) => x.b);
  return both
    .filter(({ s }) => (ra.get(s.id) as number) <= k !== (rb.get(s.id) as number) <= k)
    .map(({ s }) => ({
      name: distinctName(s, data.schools),
      enters: (rb.get(s.id) as number) <= k,
      from: ra.get(s.id),
      to: rb.get(s.id),
    }));
}

// data: { pairwise, top20Changes, schools? }, the study's recorded comparison, its top-20 changes,
// and the schools (needed only for the top-10 names). opts.top: 20 (default) or 10.
export function comparisonSegments(
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  data: ComparisonData & { top20Changes: readonly Top20Change[] },
  opts: { top?: number } = {}
): Segments {
  const a = rule(ruleA),
    b = rule(ruleB);
  const k = opts.top === 10 ? 10 : 20;
  if (ruleA === ruleB) return seg`Both sides use the same rule, so nothing moves.`;
  const row = findPair(data.pairwise, ruleA, ruleB);
  if (!row) return seg`No recorded comparison exists for ${a.name} and ${b.name}.`;

  const sentences: Segments[] = [
    seg`This compares ${a.name} with ${b.name} among ${pairPhrase(row)}.`,
    seg`${agreementSentence(row, k, "under both")}`,
  ];
  const changes = topChanges(ruleA, ruleB, data, row, k);
  if (changes) {
    const ins = changes.filter((c) => c.enters).sort((x, y) => (x.to as number) - (y.to as number));
    const outs = changes.filter((c) => !c.enters).sort((x, y) => (x.from as number) - (y.from as number));
    const lead = `When you switch to ${b.name}, `;
    if (ins.length + outs.length > 0 && ins.length + outs.length <= 4) {
      const moves: Segments[] = [
        ...ins.map(
          (c) =>
            seg`${nameSegment(c.name)} moves from ${ordinal(c.from as number)} to ${ordinal(c.to as number)} and joins the top ${k}.`
        ),
        ...outs.map(
          (c) =>
            seg`${nameSegment(c.name)} moves from ${ordinal(c.from as number)} to ${ordinal(c.to as number)} and drops out of the top ${k}.`
        ),
      ];
      moves[0] = seg`${lead}${moves[0]}`;
      sentences.push(...moves);
    } else if (ins.length + outs.length > 4) {
      const lines: Segments[] = [];
      if (ins.length)
        lines.push(
          seg`${nameList(ins.map((c) => c.name))} ${plural(ins.length, "joins", "join")} the top ${k}.`
        );
      if (outs.length)
        lines.push(seg`${nameList(outs.map((c) => c.name))} ${plural(outs.length, "drops", "drop")} out.`);
      lines[0] = seg`${lead}${lines[0]}`;
      sentences.push(...lines);
    }
  }
  const half = Math.floor(row.median_absolute_rank_shift);
  const most = row.maximum_absolute_rank_shift;
  sentences.push(
    half === 0
      ? seg`At least half of the schools keep the same place in the list, and the largest move is ${most} ${plural(most, "place", "places")}.`
      : seg`Half of the schools move ${half} ${plural(half, "place", "places")} or fewer, and the largest move is ${most} ${plural(most, "place", "places")}.`
  );
  return joinSegments(sentences);
}
export const comparisonSentence = (
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  data: ComparisonData & { top20Changes: readonly Top20Change[] },
  opts: { top?: number } = {}
): string => textOf(comparisonSegments(ruleA, ruleB, data, opts));

// Answers "what did leaving urgency out change?" from the recorded comparison of the two combined-factors rules. The
// main rule leaves urgency out and the circulated rule puts it back, so it reads the same from either side: how many
// of the top stay, and how far a school moves when the urgency value is put back. data: { pairwise }.
export function urgencyReassurance(data: ComparisonData): string {
  const row = findPair(data.pairwise, "additive_no_u", "additive_u");
  if (!row) return "No recorded comparison exists for the combined-factors rules with and without urgency.";
  const most = row.maximum_absolute_rank_shift;
  const rc = data.schools ? countsFrom(data.schools) : null;
  return [
    `Among ${pairPhrase(row)}, ${lowerFirst(agreementSentence(row, 20, "with or without the urgency value"))}`,
    `Putting it back changes the order in the list, and the largest move for any school is ${most} ${plural(most, "place", "places")}.`,
    `For ${rangePhrase(rc)}, putting it back can still move ${theirScore(rc)} possible places.`,
  ].join(" ");
}

// Which list to use, short, for the rule area: a question, the answer, why urgency is left out, and the agreement
// with the rule that puts it back. data: { pairwise }.
export function defaultListStatement(data: Pick<ComparisonData, "pairwise">): string {
  const row = findPair(data.pairwise, "additive_no_u", "additive_u");
  const lead =
    "Which list should I use? This one, the paper's main rule. Urgency is left out because its source could not be traced, which says nothing about real hazards.";
  if (!row) return lead;
  const n = pairSize(row);
  const among =
    n != null
      ? `among the ${formatCount(n)} with every input recorded`
      : "among the schools with every input recorded";
  if (n != null && n <= 20) return `${lead} Putting it back keeps the same schools at the top ${among}.`;
  if (row.top20_overlap !== 20)
    return `${lead} Putting it back keeps ${row.top20_overlap} of the top 20 ${among}.`;
  const larger = ([30, 40] as const).filter((k) => overlapAt(row, k) === k);
  const tail = larger.length ? ` and top ${Math.max(...larger)}` : "";
  return `${lead} Putting it back keeps the same top 20${tail} ${among}.`;
}

// The long form, for a help card or disclosure. data: { pairwise }.
export function defaultListStatementLong(data: Pick<ComparisonData, "pairwise">): string {
  const row = findPair(data.pairwise, "additive_no_u", "additive_u");
  const lead = `This list uses the paper's main rule, ${rule("additive_no_u").name}. It leaves out the urgency value, because no one could trace where it comes from; that says nothing about whether schools face real hazards. The circulated paper's rule with urgency, ${rule("additive_u").name}, is kept beside it as a sensitivity check.`;
  if (!row) return lead;
  return `${lead} Among ${pairPhrase(row)}, ${lowerFirst(agreementSentence(row, 20, "under both"))}`;
}
