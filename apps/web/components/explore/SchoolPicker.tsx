"use client";

import { useId } from "react";

import { EXPLORE } from "@/lib/screening/copy/explore";

import styles from "./explore.module.css";

/** The schools of one province, each with the name the tool shows it by. */
export interface PickerGroup {
  readonly province: string;
  readonly schools: readonly { readonly id: string; readonly name: string }[];
}

/**
 * The page's one control: a school chosen here is marked in every chart. A native select, so a keyboard, a screen
 * reader and a phone's own picker all work as they do anywhere; typing a name's first letters moves to it.
 */
export function SchoolPicker({
  groups,
  value,
  onChange,
}: {
  groups: readonly PickerGroup[];
  /** The marked school's id, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {EXPLORE.pick.label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value ?? ""}
        aria-describedby={hintId}
        data-region="school-picker"
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{EXPLORE.pick.none}</option>
        {groups.map((group) => (
          <optgroup key={group.province} label={group.province}>
            {group.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p id={hintId} className={styles.hint}>
        {EXPLORE.pick.hint}
      </p>
    </div>
  );
}
