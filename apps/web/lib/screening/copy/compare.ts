/**
 * Comparing two rules, from the study's recorded comparison. These functions take the comparison as an argument
 * because this module never fetches. `urgencyReassurance` and the list statements answer "which list should I use".
 */
import { countsFrom, rangePhrase, theSchools } from "./counts";
import { cleanName, displayName, formatCount, joinList, lowerFirst, ordinal, plural } from "./format";
import type { ComparisonData, CopyRuleId, PairwiseRow, Top20Change } from "./model";
import { hasPlace, resultFor } from "./rank";
import { rule } from "./rules";

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
        name: cleanName(c["School Name"]),
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
      name: displayName(s),
      enters: (rb.get(s.id) as number) <= k,
      from: ra.get(s.id),
      to: rb.get(s.id),
    }));
}

// data: { pairwise, top20Changes, schools? }, the study's recorded comparison, its top-20 changes,
// and the schools (needed only for the top-10 names). opts.top: 20 (default) or 10.
export function comparisonSentence(
  ruleA: CopyRuleId,
  ruleB: CopyRuleId,
  data: ComparisonData & { top20Changes: readonly Top20Change[] },
  opts: { top?: number } = {}
): string {
  const a = rule(ruleA),
    b = rule(ruleB);
  const k = opts.top === 10 ? 10 : 20;
  if (ruleA === ruleB) return "Both sides use the same rule, so nothing moves.";
  const row = findPair(data.pairwise, ruleA, ruleB);
  if (!row) return `No recorded comparison exists for ${a.name} and ${b.name}.`;

  const sentences = [
    `This compares ${a.name} with ${b.name} among ${pairPhrase(row)}.`,
    agreementSentence(row, k, "under both"),
  ];
  const changes = topChanges(ruleA, ruleB, data, row, k);
  if (changes) {
    const ins = changes.filter((c) => c.enters).sort((x, y) => (x.to as number) - (y.to as number));
    const outs = changes.filter((c) => !c.enters).sort((x, y) => (x.from as number) - (y.from as number));
    const lead = `When you switch to ${b.name}, `;
    if (ins.length + outs.length > 0 && ins.length + outs.length <= 4) {
      const moves = [
        ...ins.map(
          (c) =>
            `${c.name} moves from ${ordinal(c.from as number)} to ${ordinal(c.to as number)} and joins the top ${k}.`
        ),
        ...outs.map(
          (c) =>
            `${c.name} moves from ${ordinal(c.from as number)} to ${ordinal(c.to as number)} and drops out of the top ${k}.`
        ),
      ];
      moves[0] = lead + moves[0];
      sentences.push(...moves);
    } else if (ins.length + outs.length > 4) {
      const lines: string[] = [];
      if (ins.length)
        lines.push(
          `${joinList(ins.map((c) => c.name))} ${plural(ins.length, "joins", "join")} the top ${k}.`
        );
      if (outs.length)
        lines.push(`${joinList(outs.map((c) => c.name))} ${plural(outs.length, "drops", "drop")} out.`);
      lines[0] = lead + lines[0];
      sentences.push(...lines);
    }
  }
  const half = Math.floor(row.median_absolute_rank_shift);
  const most = row.maximum_absolute_rank_shift;
  sentences.push(
    half === 0
      ? `At least half of the schools keep the same place in the list, and the largest move is ${most} ${plural(most, "place", "places")}.`
      : `Half of the schools move ${half} ${plural(half, "place", "places")} or fewer, and the largest move is ${most} places.`
  );
  return sentences.join(" ");
}

// Answers "what changes without urgency?" from the recorded comparison of the two combined-factors rules.
// data: { pairwise }.
export function urgencyReassurance(data: ComparisonData): string {
  const row = findPair(data.pairwise, "additive_u", "additive_no_u");
  if (!row) return "No recorded comparison exists for the combined-factors rules with and without urgency.";
  const most = row.maximum_absolute_rank_shift;
  return [
    `Among ${pairPhrase(row)}, ${lowerFirst(agreementSentence(row, 20, "with or without the urgency value"))}`,
    `Leaving it out changes the order in the list, and the largest move for any school is ${most} places.`,
    `For ${rangePhrase(data.schools ? countsFrom(data.schools) : null)}, leaving it out can still move their possible places.`,
  ].join(" ");
}

// Which list to use, short, for the rule area: a question, the answer, and the agreement. data: { pairwise }.
export function defaultListStatement(data: Pick<ComparisonData, "pairwise">): string {
  const row = findPair(data.pairwise, "additive_u", "additive_no_u");
  const lead = "Which list should I use? This one, the paper's main rule, until the research team decides.";
  if (!row) return lead;
  const n = pairSize(row);
  const among =
    n != null
      ? `among the ${formatCount(n)} with every input recorded`
      : "among the schools with every input recorded";
  if (n != null && n <= 20) return `${lead} Leaving urgency out keeps the same schools at the top ${among}.`;
  if (row.top20_overlap !== 20)
    return `${lead} Leaving urgency out keeps ${row.top20_overlap} of the top 20 ${among}.`;
  const larger = ([30, 40] as const).filter((k) => overlapAt(row, k) === k);
  const tail = larger.length ? ` and top ${Math.max(...larger)}` : "";
  return `${lead} Leaving urgency out keeps the same top 20${tail} ${among}.`;
}

// The long form, for a help card or disclosure. data: { pairwise }.
export function defaultListStatementLong(data: Pick<ComparisonData, "pairwise">): string {
  const row = findPair(data.pairwise, "additive_u", "additive_no_u");
  const lead = `This list uses the paper's main rule, ${rule("additive_u").name}. Use it until the research team decides on the proposed revision, ${rule("additive_no_u").name}.`;
  if (!row) return lead;
  return `${lead} Among ${pairPhrase(row)}, ${lowerFirst(agreementSentence(row, 20, "under both"))}`;
}
