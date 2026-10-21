"use client";

import { useEffect, useRef, useState } from "react";

import { type Piece, type Ring, ringAround, sameRings } from "@/lib/screening/guide/rings";

import { reducedMotion, scrollParent, shows } from "./dom";
import styles from "./guide.module.css";

/** The floating panels a ring stays inside. */
const PANEL = '[data-slot="column"], [data-slot="school-card"], [data-slot="legend"]';

function measure(root: HTMLElement, targets: readonly (readonly string[])[]): Ring[] {
  const rings: Ring[] = [];
  for (const group of targets) {
    const pieces: Piece[] = [];
    let panel: Element | null = null;
    for (const selector of group) {
      for (const element of root.querySelectorAll(selector)) {
        if (!shows(element)) continue;
        const clip = scrollParent(element);
        pieces.push({
          box: element.getBoundingClientRect(),
          clip: clip ? clip.getBoundingClientRect() : null,
        });
        panel ??= element.closest(PANEL);
      }
    }
    const ring = ringAround(pieces, panel ? panel.getBoundingClientRect() : null);
    if (ring) rings.push(ring);
  }
  return rings;
}

/**
 * The rings round what a guide step points at: 2 px navy with a 4 px halo, `aria-hidden` (the step's "On screen"
 * line names the same place in words). They follow their regions as panels scroll, cards open and the layout
 * changes, and move in 220 ms after a click but jump after a key.
 */
export function Rings({
  root,
  targets,
  keyboard,
}: {
  root: HTMLElement;
  targets: readonly (readonly string[])[];
  keyboard: { current: boolean };
}) {
  const [rings, setRings] = useState<Ring[]>([]);
  const last = useRef<Ring[]>([]);
  // A new step moves the rings already on screen to its regions in 220 ms after a click; otherwise (a scroll, a
  // card opening, a key) they follow at once. Rings that appear for the first time are placed at once.
  const key = JSON.stringify(targets);
  const stepKey = useRef(key);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (stepKey.current === key) return;
    stepKey.current = key;
    if (keyboard.current || reducedMotion() || last.current.length === 0) return;
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), 260);
    return () => clearTimeout(timer);
  }, [key, keyboard]);

  useEffect(() => {
    const groups = JSON.parse(key) as string[][];
    let frame = 0;
    const tick = () => {
      if (!document.hidden) {
        const next = measure(root, groups);
        if (!sameRings(next, last.current)) {
          last.current = next;
          setRings(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [root, key]);

  return (
    <div className={styles.rings} aria-hidden="true" data-testid="guide-rings">
      {rings.map((ring, index) => (
        <div
          key={index}
          className={styles.ring}
          data-moving={moving || undefined}
          style={{ transform: `translate(${ring.x}px, ${ring.y}px)`, width: ring.width, height: ring.height }}
        />
      ))}
    </div>
  );
}
