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

/**
 * A share as a percent, whole where that is true to it and to one or two decimals where rounding would carry it to
 * the other side of `line`: 0.7999 against 0.8 is "79.99%", never "80%".
 */
export function percentBeside(fraction: number, line: number): string {
  const above = fraction >= line;
  for (const digits of [0, 1, 2]) {
    const v = percentAt(fraction, digits);
    if (v >= percentAt(line, 4) === above) return written(v);
  }
  return written(percentAt(fraction, 4));
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
      percent: percentBeside(found.frequency, threshold),
    });
  }
  // The flag says persistent exactly when every setting reaches the line. A drawing that says otherwise would
  // contradict the sentence above it, so it is not drawn.
  if (tracks.every((t) => t.reaches) !== flag.persistent) return null;

  const half = test.band;
  const band =
    half !== undefined && half > 0
      ? (() => {
          const lo = Math.max(0, threshold - half);
          const hi = Math.min(1, threshold + half);
          return { lo, hi, loPercent: written(percentAt(lo, 1)), hiPercent: written(percentAt(hi, 1)) };
        })()
      : null;
  return { threshold, thresholdPercent: written(percentAt(threshold, 1)), band, tracks };
}
