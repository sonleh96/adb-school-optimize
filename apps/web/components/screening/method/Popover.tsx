"use client";

import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import base from "../screening.module.css";
import styles from "./method.module.css";

/**
 * A popover beside its button, drawn in the workspace's popover layer so no panel clips it. It closes on a click
 * elsewhere, on resize, and on Escape, which it takes before any layer behind it (the innermost layer closes first)
 * and which hands focus back to its button. Opened from the keyboard it appears at once; by pointer it grows from
 * its button.
 */
export function Popover({
  id,
  anchor,
  layer,
  label,
  align = "start",
  width = 320,
  instant,
  onClose,
  children,
}: {
  id: string;
  anchor: RefObject<HTMLElement | null>;
  layer: HTMLElement | null;
  label: string;
  /** Which edge of the button the popover lines up with. */
  align?: "start" | "end";
  width?: number;
  instant: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor.current || !layer) return;
    const b = anchor.current.getBoundingClientRect();
    const host = layer.getBoundingClientRect();
    const top = b.bottom - host.top + 6;
    const wanted = align === "end" ? b.right - host.left - width : b.left - host.left;
    const left = Math.max(8, Math.min(wanted, host.width - width - 8));
    setAt({ top, left, maxHeight: Math.max(160, host.height - top - 16) });
  }, [anchor, layer, align, width]);

  const placed = at !== null;
  useEffect(() => {
    if (!placed) return;
    const first = panel.current?.querySelector<HTMLElement>(
      "[aria-pressed=true], [aria-selected=true], input, select, button"
    );
    first?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      anchor.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!layer) return null;
  return createPortal(
    <div
      ref={panel}
      id={id}
      className={`${base.pop} ${styles.pop}`}
      data-instant={instant || undefined}
      data-align={align}
      style={at ? { ...at, width } : { visibility: "hidden", width }}
      role="group"
      aria-label={label}
    >
      <div className={base.popScroll}>{children}</div>
    </div>,
    layer
  );
}
