"use client";

import styles from "./method.module.css";

/**
 * "Show method details": one switch for the method layer over the same screen. Its knob slides 160 ms on a click and
 * not at all from the keyboard (the workspace marks keyboard actions instant). Pointing at it starts loading the
 * method layer's code, so turning it on rarely waits.
 */
export function MethodSwitch({
  label,
  on,
  disabled,
  title,
  onToggle,
  onIntent,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  title?: string;
  onToggle: () => void;
  onIntent: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={styles.switch}
      data-region="method-switch"
      disabled={disabled}
      title={title}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onClick={onToggle}
    >
      <span>{label}</span>
      <span className={styles.switchTrack} aria-hidden />
    </button>
  );
}
