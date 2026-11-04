/**
 * What the method details draw for a school's persistence test under one rule: one 0 to 100% track per setting, each
 * with the school's frequency, the threshold and the band around it. All positions are fractions of the track, so the
 * drawing and its words read the same numbers.
 *
 * The drawing only adds to the flag the card already states, so anything it cannot read draws nothing: no test, no
 * frequencies, frequencies that do not match the settings one for one, or frequencies that disagree with the flag.
 */
import type { PersistenceFlag, PersistenceTest } from "@/lib/screening/copy/model";

export interface FrequencyTrack {
  /** The setting's position in the test's settings, which the words name it by. */
  readonly index: number;
  /** The school's share of the runs in which it stayed in the top 20, from 0 to 1. */
  readonly frequency: number;
  /** At or above the threshold, as the flag counts it. */
  readonly reaches: boolean;
  /** The frequency as a percent, worded so that its rounding stays on the frequency's side of the line. */
  readonly percent: string;
}

export interface FrequencyTracks {
  readonly threshold: number;
  readonly thresholdPercent: string;
  /** The band either side of the threshold, held to 0 to 1; null when the test gives no standard error. */
  readonly band: {
    readonly lo: number;
    readonly hi: number;
    readonly loPercent: string;
    readonly hiPercent: string;
  } | null;
  readonly tracks: readonly FrequencyTrack[];
}

const percentAt = (fraction: number, digits: number): number => Number((fraction * 100).toFixed(digits));
const written = (v: number): string => `${v}%`;
// A percent to `digits` decimals, halves rounded up: 0.8105 is 81.1, where toFixed alone gives 81.0 from 81.04999...
const fixedPercent = (fraction: number, digits: number): string =>
  (Math.round(fraction * 10 ** (digits + 2) * (1 + Number.EPSILON)) / 10 ** digits).toFixed(digits);

/** The band as its words print it, to one decimal of a percent. */
const printedBand = (band: { lo: number; hi: number }) => ({
  lo: percentAt(band.lo, 1),
  hi: percentAt(band.hi, 1),
});

/**
 * A share as a percent, with as few decimals as keep it true to where its mark is drawn:
 * - on the frequency's side of `line`: 0.7999 against 0.8 is "79.99%", never "80%";
 * - inside the band's printed range exactly when the mark is inside `band`: 0.7854 against a band printed
 *   "78.9% to 81.1%" is "78.5%", never "79%";
 * - inside the band, at least one decimal, so a school just above the line does not read as on it: 0.8014 is "80.1%".
 */
export function percentBeside(fraction: number, line: number, band?: { lo: number; hi: number }): string {
  const above = fraction >= line;
  const inBand = band !== undefined && fraction >= band.lo && fraction <= band.hi;
  const printed = band && printedBand(band);
  for (const digits of inBand ? [1, 2, 3, 4] : [0, 1, 2, 3, 4]) {
    const fixed = fixedPercent(fraction, digits);
    const v = Number(fixed);
    const sameSide = v >= percentAt(line, 4) === above;
    const sameBand = !printed || (v >= printed.lo && v <= printed.hi) === inBand;
    if (sameSide && sameBand) return `${fixed}%`;
  }
  return written(percentAt(fraction, 6));
}

/** The drawing of `flag`'s frequencies under `test`, or null when there is nothing it can draw truthfully. */
export function frequencyTracks(
  test: PersistenceTest | undefined,
  flag: PersistenceFlag | undefined
): FrequencyTracks | null {
  const frequencies = flag?.frequencies;
  if (!test || !frequencies || frequencies.length === 0) return null;
  const { threshold, settings } = test;
  if (!(threshold > 0 && threshold <= 1) || settings.length !== frequencies.length) return null;

  const half = test.band;
  const edges =
    half !== undefined && half > 0
      ? { lo: Math.max(0, threshold - half), hi: Math.min(1, threshold + half) }
      : undefined;

  // By id where the test names its settings, else by order, which is the order the API sends them in.
  const named = settings.every((s) => s.id !== undefined);
  const tracks: FrequencyTrack[] = [];
  for (const [index, setting] of settings.entries()) {
    const found = named ? frequencies.find((f) => f.setting === setting.id) : frequencies[index];
    if (!found || !(found.frequency >= 0 && found.frequency <= 1)) return null;
    const reaches = found.frequency >= threshold;
    tracks.push({
      index,
      frequency: found.frequency,
      reaches,
      percent: percentBeside(found.frequency, threshold, edges),
    });
  }
  // The flag says persistent exactly when every setting reaches the line. A drawing that says otherwise would
  // contradict the sentence above it, so it is not drawn.
  if (tracks.every((t) => t.reaches) !== flag.persistent) return null;

  const band = edges
    ? (() => {
        const printed = printedBand(edges);
        return { ...edges, loPercent: written(printed.lo), hiPercent: written(printed.hi) };
      })()
    : null;
  return { threshold, thresholdPercent: written(percentAt(threshold, 1)), band, tracks };
}
