import styles from "./screening.module.css";

const PART = /(\d+)(st|nd|rd|th)\b| (to) | (of [\d,]+)/g;

/**
 * A place as the copy wrote it ("3rd", "12th to 27th", "10th of 21"), set as the design sets places: each ordinal
 * with its suffix raised, and the joining words ("to", "of 21") small and italic. The words are the copy's; only their
 * setting changes. A joining word keeps its spaces, at its own small size, so the place reads and copies as words.
 * The group a range counts in ("of 21") is marked, so a range can set it on a line of its own.
 */
export function PlaceText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(PART)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(<span key={`t${last}`}>{text.slice(last, at)}</span>);
    parts.push(
      match[1] ? (
        <span key={at} className={styles.ordinal}>
          {match[1]}
          <sup className={styles.ord}>{match[2]}</sup>
        </span>
      ) : (
        <i key={at} className={styles.placeTo} data-of={match[4] ? "" : undefined}>
          {match[0]}
        </i>
      )
    );
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(<span key={`t${last}`}>{text.slice(last)}</span>);
  return <>{parts}</>;
}
