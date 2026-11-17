import type { CSSProperties } from "react";

import type { Method } from "@/lib/screening/copy/method";
import type { PersistenceTest } from "@/lib/screening/copy/model";
import type { FrequencyTracks as Drawing } from "@/lib/screening/method/tracks";

import base from "../screening.module.css";
import styles from "./tracks.module.css";

/** A position on the track, as a fraction from 0 to 1, for the stylesheet to place a mark by. */
const at = (fraction: number) => ({ "--at": fraction }) as CSSProperties;

/**
 * A school's top-20 frequency in each setting of one rule's persistence test: a 0 to 100% track per setting on one
 * shared axis, each with the line, the band around it and the school's mark, the value worded beside the mark. A
 * screen reader hears the list's words: each setting, its share and whether it reaches the line. Nothing in it moves
 * or answers a pointer.
 */
export function FrequencyTracks({
  method,
  rule,
  named = false,
  test,
  drawing,
}: {
  method: Method;
  /** The rule's short name, which names the figure. */
  rule: string;
  /** Two such figures stack in compare mode, so each also shows its rule's name. */
  named?: boolean;
  test: PersistenceTest;
  drawing: Drawing;
}) {
  const words = method.insp.frequencies;
  const { band, threshold, thresholdPercent } = drawing;
  return (
    <figure className={styles.figure} aria-label={words.title(rule)} data-region="frequency-tracks">
      <div className={styles.head}>
        <span className={base.eyebrow}>{words.eyebrow}</span>
        {named ? <span className={base.eyebrow}>{rule}</span> : null}
      </div>
      <p className={styles.text}>{words.what(drawing.tracks.length)}</p>
      <ul className={styles.list}>
        {drawing.tracks.map((track) => (
          <li key={track.index} className={styles.row} data-reaches={track.reaches}>
            <span className={styles.setting}>{words.setting(test.settings, track.index)}</span>
            <div className={styles.plot} aria-hidden>
              <div className={styles.track}>
                {band ? (
                  <span
                    className={styles.band}
                    data-part="band"
                    style={{ ...at(band.lo), "--to": band.hi } as CSSProperties}
                  />
                ) : null}
                <span className={styles.line} data-part="line" style={at(threshold)} />
                <span className={styles.mark} data-part="mark" style={at(track.frequency)} />
              </div>
            </div>
            <div className={styles.plot}>
              <span className={styles.value} style={at(track.frequency)}>
                {words.runs(track.percent)}
                <span className={styles.sr}>
                  {`, ${track.reaches ? words.reaches(thresholdPercent) : words.below(thresholdPercent)}`}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className={`${styles.plot} ${styles.axis}`} aria-hidden>
        <span style={at(0)}>0%</span>
        <span className={styles.axisLine} style={at(threshold)}>
          {words.line(thresholdPercent)}
        </span>
        <span style={at(1)}>100%</span>
      </div>
      {band ? <p className={styles.note}>{words.band(band.loPercent, band.hiPercent)}</p> : null}
      <p className={styles.note}>{words.caveat}</p>
    </figure>
  );
}
