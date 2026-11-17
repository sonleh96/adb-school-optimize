"use client";

import { useLayoutEffect, useRef, useState } from "react";

import styles from "./screening.module.css";

/** What the tooltip says about one school; every string is the copy's. */
export interface TipContent {
  /** The display name, told apart from a twin (R16, R17). */
  name: string;
  /** Where the school is, with blanks said in words. */
  where: string;
  /** Its place in a sentence; for a range school, the first sentence only. */
  place: string;
  /** A second, quieter line: why a range school shows a range. */
  note: string | null;
  /** "Select to see why", shown when the school is not the one already open. */
  hint: string;
}

const OFFSET = 14;
const EDGE = 12;

/**
 * The map's tooltip, placed above and to the right of the mark, and flipped when it would leave the map. It is at
 * most 280 px wide and a name wraps at any character, so even an unbreakable name stays inside it (R5).
 */
export function MapTooltip({
  content,
  at,
  width,
  selected,
}: {
  content: TipContent | null;
  /** The mark's position in the map, and the map's width. */
  at: { x: number; y: number };
  width: number;
  selected: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const tip = box.current;
    if (!tip) return;
    const { offsetWidth: w, offsetHeight: h } = tip;
    let left = at.x + OFFSET;
    let top = at.y - h - 10;
    if (left + w > width - EDGE) left = at.x - w - OFFSET;
    if (top < EDGE) top = at.y + OFFSET;
    setPlace({ left: Math.max(EDGE, left), top });
  }, [at.x, at.y, width, content]);

  if (!content) return null;
  return (
    <div
      ref={box}
      className={styles.tooltip}
      role="status"
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <strong className={styles.tipName}>{content.name}</strong>
      <span className={styles.tipWhere}>{content.where}</span>
      <span className={styles.tipPlace}>{content.place}</span>
      {content.note ? <span className={styles.tipNote}>{content.note}</span> : null}
      {selected ? null : <span className={styles.tipHint}>{content.hint}</span>}
    </div>
  );
}
