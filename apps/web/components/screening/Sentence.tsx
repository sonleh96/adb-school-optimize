import { type Segments, isName } from "@/lib/screening/copy";

import styles from "./screening.module.css";

/**
 * A sentence from the copy with each school name set apart in medium weight, so a name that looks like punctuation
 * or a letter (a school called "J") still reads as a name (R18). The words are exactly `textOf(segments)`.
 */
export function Sentence({ segments }: { segments: Segments }) {
  return (
    <>
      {segments.map((segment, index) =>
        isName(segment) ? (
          <span key={index} className={styles.nameIn} data-name-kind={segment.kind}>
            {segment.name}
          </span>
        ) : (
          segment
        )
      )}
    </>
  );
}
