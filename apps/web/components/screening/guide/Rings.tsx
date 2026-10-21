"use client";

import { useEffect, useRef, useState } from "react";

import { type Piece, type Ring, ringAround, sameRings } from "@/lib/screening/guide/rings";

import { reducedMotion, scrollParent, shows } from "./dom";
import styles from "./guide.module.css";

/** The floating panels a ring stays inside. */
const PANEL = '[data-slot="column"], [data-slot="school-card"], [data-slot="legend"]';

function measure(
  root: HTMLElement,
  targets: readonly (readonly string[])[],
  seen: (element: Element) => void
): Ring[] {
  const rings: Ring[] = [];
  for (const group of targets) {
    const pieces: Piece[] = [];
    let panel: Element | null = null;
    for (const selector of group) {
      for (const element of root.querySelectorAll(selector)) {
        seen(element);
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
 *
 * They measure only when something could have moved them: a resize of the workspace or of a ringed element, a
 * scroll, a transition or animation, a change to the workspace's markup, or a change of state. After that they
 * measure each frame while the rings still move and stop after two quiet frames, so a step left on screen during a
 * meeting does not keep the presenter's laptop busy.
 */
export function Rings({
  root,
  targets,
  keyboard,
  stores,
}: {
  root: HTMLElement;
  targets: readonly (readonly string[])[];
  keyboard: { current: boolean };
  /** The workspace's and the layers' stores: a change of state can move what a step points at. */
  stores: readonly { subscribe: (listener: () => void) => () => void }[];
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
    let quiet = 0;
    const sizes = new ResizeObserver(() => wake());
    const watched = new Set<Element>();
    const watch = (element: Element) => {
      if (watched.has(element)) return;
      watched.add(element);
      sizes.observe(element);
    };
    const tick = () => {
      frame = 0;
      const next = measure(root, groups, watch);
      if (!sameRings(next, last.current)) {
        last.current = next;
        setRings(next);
        quiet = 0;
      } else quiet += 1;
      // Still moving (a panel sliding, a card opening): follow it frame by frame until it has settled.
      if (quiet < 2) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      quiet = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    sizes.observe(root);
    const markup = new MutationObserver(wake);
    markup.observe(root, { childList: true, subtree: true });
    const motion = ["scroll", "transitionrun", "transitionend", "animationstart", "animationend"];
    for (const type of motion) root.addEventListener(type, wake, true);
    window.addEventListener("resize", wake);
    const stops = stores.map((store) => store.subscribe(wake));
    wake();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      markup.disconnect();
      for (const type of motion) root.removeEventListener(type, wake, true);
      window.removeEventListener("resize", wake);
      stops.forEach((stop) => stop());
    };
  }, [root, key, stores]);

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
