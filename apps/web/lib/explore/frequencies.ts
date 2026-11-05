/**
 * The explore page's dot plot of top-20 frequencies: for each setting of a rule's persistence test, the schools of the
 * list in columns by the share of runs in which each stayed in the top 20.
 *
 * The columns are ranges of shares, ordered but not to scale, and the page says so beside the axis and names each
 * column's range under it. Exactly none of the runs and every run each have a column, since the shares pile up there.
 * Between them, a column never straddles the line or a band edge, so a dot is on the side of the line, and inside or
 * outside the band, that its share is. The line and the band are the ones the method details draw for the same school
 * (`frequencyTracks`), so the two drawings never disagree. Below the band the columns split where a reader needs to
 * see how far from the line a school is: see `CUTOFFS`.
 */
import type { FrequencyBin, FrequencyEnd } from "@/lib/screening/copy/explore-stability";
import type { CopySchool, PersistenceRule, PersistenceTest } from "@/lib/screening/copy/model";
import { inList } from "@/lib/screening/copy/standing";
import { type FrequencyTracks, frequencyTracks } from "@/lib/screening/method/tracks";

/**
 * Where the columns below the band split:
 * - 10%: fewer than 1 run in 10, the low tail where most schools of the list sit, so that pile is never read as near
 *   the line;
 * - 50%: half the runs, below which a school was out of the top 20 more often than in it;
 * - 70%: the lowest cutoff the paper reports beside its 80% line (it counts schools at 70%, 80% and 90%).
 * Above the band one column holds every share short of all the runs: the paper's 90% cutoff would only split schools
 * that already reach the line, and a phone has no room for a tenth column.
 */
export const CUTOFFS: readonly number[] = [0.1, 0.5, 0.7];

export interface FrequencyAxis {
  readonly bins: readonly FrequencyBin[];
  readonly threshold: number;
  readonly band: { readonly lo: number; readonly hi: number } | null;
  /** The first column at or above the line: the line is drawn on the edge before it. */
  readonly line: number;
}

/** An edge between two columns, and which column holds a share exactly on it. */
interface Cut {
  readonly at: number;
  /** The column after the edge holds a share exactly on it; otherwise the column before does. */
  readonly after: boolean;
}

/**
 * The columns for a test with `threshold` and, when it has one, the band round it. The band holds both its ends, as
 * the method details' drawing counts them, and a share on the line reaches it. A cutoff inside the band is left out,
 * so the band stays whole.
 */
export function frequencyAxis(
  threshold: number,
  band: { readonly lo: number; readonly hi: number } | null
): FrequencyAxis {
  const inside = (at: number) => at > 0 && at < 1;
  const cuts: Cut[] = [
    ...CUTOFFS.filter((at) => (band ? at < band.lo || at > band.hi : at !== threshold)).map((at): Cut => ({
      at,
      after: true,
    })),
    { at: threshold, after: true },
    ...(band
      ? [
          { at: band.lo, after: true },
          { at: band.hi, after: false },
        ]
      : []),
  ]
    .filter((cut) => inside(cut.at))
    .sort((a, b) => a.at - b.at);

  const ends: [FrequencyEnd, FrequencyEnd][] = [];
  let from: FrequencyEnd = { at: 0, holds: false };
  for (const cut of cuts) {
    ends.push([from, { at: cut.at, holds: !cut.after }]);
    from = { at: cut.at, holds: cut.after };
  }
  ends.push([from, { at: 1, holds: false }]);

  const bins: FrequencyBin[] = [
    { kind: "none" },
    ...ends
      // Two cuts on one share leave nothing between them.
      .filter(([a, b]) => a.at < b.at || (a.holds && b.holds))
      .map(([a, b]): FrequencyBin => ({
        kind: "span",
        from: a,
        to: b,
        band: band !== null && a.at >= band.lo && b.at <= band.hi,
      })),
    { kind: "all" },
  ];
  // The line sits on the edge before the column that starts at the threshold and holds it.
  const line =
    threshold >= 1
      ? bins.length - 1
      : bins.findIndex((bin) => bin.kind === "span" && bin.from.at === threshold && bin.from.holds);
  return { bins, threshold, band, line };
}

/** Whether a column holds the share `f`. */
const holds = (bin: FrequencyBin, f: number): boolean => {
  switch (bin.kind) {
    case "none":
      return f === 0;
    case "all":
      return f === 1;
    case "span":
      return (
        (f > bin.from.at || (f === bin.from.at && bin.from.holds)) &&
        (f < bin.to.at || (f === bin.to.at && bin.to.holds))
      );
  }
};

/** The column holding the share `f`, from 0 to 1. */
export function binOf(axis: FrequencyAxis, f: number): number {
  const index = axis.bins.findIndex((bin) => holds(bin, f));
  if (index < 0) throw new Error(`No column holds the share ${f}`);
  return index;
}

/** One rule's dot plot: its test's columns, and the schools of its list in them, setting by setting. */
export interface FrequencyPlot {
  readonly rule: PersistenceRule;
  readonly test: PersistenceTest;
  readonly axis: FrequencyAxis;
  /** The line and the band as the method details word them, read from any one school's drawing: they are the test's. */
  readonly words: Pick<FrequencyTracks, "thresholdPercent" | "band">;
  /** For each setting, in the test's order, the schools in each column, in the list's order. */
  readonly rows: readonly (readonly (readonly CopySchool[])[])[];
  /** Each drawn school's frequencies, as the method details draw them, by its id. */
  readonly drawn: ReadonlyMap<string, FrequencyTracks>;
  /** The schools of the list with no frequencies this test can draw: they have no dot, but count in the list. */
  readonly undrawn: readonly CopySchool[];
  /** How many schools of the list reach the line in every setting. */
  readonly persistent: number;
}

/**
 * The plot of `rule`'s test over the schools that rule puts in order, or null when its list carries no test or no
 * school has frequencies to draw. Only the rule's own frequencies are read, never another rule's.
 */
export function frequencyPlot(
  schools: readonly CopySchool[],
  rule: PersistenceRule,
  test: PersistenceTest | undefined
): FrequencyPlot | null {
  if (!test) return null;
  const listed = schools.filter((school) => inList(school, rule));
  const drawn = new Map<string, FrequencyTracks>();
  const undrawn: CopySchool[] = [];
  for (const school of listed) {
    const drawing = frequencyTracks(test, school.persistence?.[rule]);
    if (drawing) drawn.set(school.id, drawing);
    else undrawn.push(school);
  }
  const first = drawn.values().next().value;
  if (!first) return null;

  const axis = frequencyAxis(first.threshold, first.band && { lo: first.band.lo, hi: first.band.hi });
  const rows = test.settings.map((_, setting) => {
    const columns: CopySchool[][] = axis.bins.map(() => []);
    for (const school of listed) {
      const track = drawn.get(school.id)?.tracks[setting];
      if (track) columns[binOf(axis, track.frequency)].push(school);
    }
    return columns;
  });
  return {
    rule,
    test,
    axis,
    words: { thresholdPercent: first.thresholdPercent, band: first.band },
    rows,
    drawn,
    undrawn,
    persistent: [...drawn.values()].filter((d) => d.tracks.every((t) => t.reaches)).length,
  };
}
