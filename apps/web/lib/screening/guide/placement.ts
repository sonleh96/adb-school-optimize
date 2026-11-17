/**
 * Where a help card opens: beside the panel that holds its subject, never on top of the thing it explains. Beside a
 * floating bar (the map bar, the key, the actions) it opens above or below the bar instead. The card grows from the
 * side that faces its subject.
 */
import type { Box } from "./rings";

export interface Placement {
  readonly x: number;
  readonly y: number;
  /** The CSS transform origin, so the card scales from its subject. */
  readonly origin: string;
}

const MARGIN = 16;
const GAP = 12;

export function placeCard(
  anchor: Box,
  host: Box | null,
  size: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
  bar: boolean
): Placement {
  const { width: w, height: h } = size;
  const hr = host ?? anchor;
  const clampX = (v: number) => Math.max(MARGIN, Math.min(view.width - w - MARGIN, v));
  const clampY = (v: number) => Math.max(MARGIN, Math.min(view.height - h - MARGIN, v));
  const midY = (anchor.top + anchor.bottom) / 2;
  const midX = (anchor.left + anchor.right) / 2;
  let x: number;
  let y: number;
  let side: "left" | "right" | "top" | "bottom";
  if (bar) {
    x = clampX(anchor.left - 20);
    if (anchor.top > view.height / 2) {
      y = Math.max(MARGIN, hr.top - GAP - h);
      side = "bottom";
    } else {
      y = hr.bottom + GAP;
      side = "top";
    }
  } else if (hr.right + GAP + w <= view.width - MARGIN) {
    x = hr.right + GAP;
    y = clampY(anchor.top - 10);
    side = "left";
  } else if (hr.left - GAP - w >= MARGIN) {
    x = hr.left - GAP - w;
    y = clampY(anchor.top - 10);
    side = "right";
  } else if (anchor.bottom + GAP + h <= view.height - MARGIN) {
    x = clampX(anchor.left);
    y = anchor.bottom + GAP;
    side = "top";
  } else {
    x = clampX(anchor.left);
    y = Math.max(MARGIN, anchor.top - GAP - h);
    side = "bottom";
  }
  const oy = Math.round(Math.max(0, Math.min(h, midY - y)));
  const ox = Math.round(Math.max(0, Math.min(w, midX - x)));
  const origin =
    side === "left"
      ? `0 ${oy}px`
      : side === "right"
        ? `100% ${oy}px`
        : side === "top"
          ? `${ox}px 0`
          : `${ox}px 100%`;
  return { x: Math.round(x), y: Math.round(y), origin };
}
