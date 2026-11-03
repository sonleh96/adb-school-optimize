"use client";

/**
 * The find control: a province, a district of it, and part of a school's name. Officials think by province and
 * district, so the plain screen offers both, behind one compact button on the line above the list. Every change
 * applies at once and goes through the workspace controller, so the address, a copied link, a saved view, the
 * downloads and the printout all carry it. A filter hides rows and fades marks; it never renumbers a rank.
 */
import { Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useEffectEvent, useId, useLayoutEffect, useRef } from "react";

import type { BoundCopy } from "@/lib/screening/copy";
import type { FilterOptions } from "@/lib/screening/filters";
import { SEARCH_MAX } from "@/lib/screening/workspace/state";

import styles from "./screening.module.css";

export interface FindValue {
  readonly prov: string | null;
  readonly dist: string | null;
  readonly q: string | null;
}
export type FindPatch = { prov?: string | null; dist?: string | null; q?: string | null };

/** The id of the plain screen's panel, which the button controls. */
const FIND_PANEL_ID = "screening-find";

/**
 * A district with no province chosen yet is offered under its province, and choosing it chooses both, so the value
 * names the pair: two provinces may hold districts of the same name.
 */
const pairValue = (province: string, district: string) => JSON.stringify([province, district]);
function pairOf(value: string): [string, string] | null {
  try {
    const pair: unknown = JSON.parse(value);
    return Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === "string")
      ? [pair[0], pair[1]]
      : null;
  } catch {
    return null;
  }
}

/**
 * The three fields, for the plain screen's panel and the method details' filter. `onChosen` hears that a choice is
 * made: a district picked with the pointer or a finger, or Enter in any field. A province picked that way is not the
 * end of it: the keyboard goes on to District, so a district can follow without another click. A list moved through
 * with the arrow keys changes at each key on some systems, so a key's change is not a choice until Enter.
 */
export function FindFields({
  copy,
  options,
  value,
  onChange,
  onChosen,
}: {
  copy: BoundCopy;
  options: FilterOptions;
  value: FindValue;
  onChange: (patch: FindPatch) => void;
  onChosen?: () => void;
}) {
  const ids = useId();
  const { LAYOUT } = copy;
  const shown = (text: string) => copy.cleanName(text);
  const districts = value.prov !== null ? (options.places.get(value.prov) ?? []) : null;
  // The last thing that moved a list: a key, or the pointer.
  const byKey = useRef(false);
  const districtList = useRef<HTMLSelectElement>(null);
  const picked = (value: string) => value !== "" && !byKey.current && onChosen !== undefined;
  const listEvents = {
    onPointerDown: () => {
      byKey.current = false;
    },
    onKeyDown: (event: KeyboardEvent<HTMLSelectElement>) => {
      if (event.key !== "Enter") {
        byKey.current = true;
        return;
      }
      if (event.currentTarget.value === "" || !onChosen) return;
      event.preventDefault();
      onChosen();
    },
  };
  return (
    <>
      <label className={styles.findField} htmlFor={`${ids}-prov`}>
        <span>{LAYOUT.byProvince}</span>
        <select
          id={`${ids}-prov`}
          value={value.prov ?? ""}
          {...listEvents}
          // A new province starts with all its districts, and the keyboard goes on to them.
          onChange={(event) => {
            onChange({ prov: event.target.value || null, dist: null });
            if (picked(event.target.value)) districtList.current?.focus();
          }}
        >
          <option value="">{LAYOUT.allProvinces}</option>
          {options.provinces.map((province) => (
            <option key={province} value={province}>
              {shown(province)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.findField} htmlFor={`${ids}-dist`}>
        <span>{LAYOUT.district}</span>
        <select
          ref={districtList}
          id={`${ids}-dist`}
          value={districts ? (value.dist ?? "") : ""}
          {...listEvents}
          onChange={(event) => {
            const chosen = event.target.value;
            if (districts) onChange({ dist: chosen || null });
            else {
              const pair = pairOf(chosen);
              if (!pair) return;
              onChange({ prov: pair[0], dist: pair[1] });
            }
            if (picked(chosen)) onChosen?.();
          }}
        >
          <option value="">{LAYOUT.allDistricts}</option>
          {districts
            ? districts.map((district) => (
                <option key={district} value={district}>
                  {shown(district)}
                </option>
              ))
            : options.provinces.map((province) => {
                const own = options.places.get(province) ?? [];
                return own.length ? (
                  <optgroup key={province} label={shown(province)}>
                    {own.map((district) => (
                      <option key={district} value={pairValue(province, district)}>
                        {shown(district)}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
        </select>
      </label>
      <label className={`${styles.findField} ${styles.findName}`} htmlFor={`${ids}-q`}>
        <span>{LAYOUT.schoolName}</span>
        <input
          id={`${ids}-q`}
          type="search"
          value={value.q ?? ""}
          maxLength={SEARCH_MAX}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => onChange({ q: event.target.value })}
          // Typing narrows the list as it goes; Enter, or a phone's Search key, says the name is done.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (event.currentTarget.value.trim() === "" || !onChosen) return;
            event.preventDefault();
            onChosen();
          }}
        />
      </label>
    </>
  );
}

/**
 * The compact button on the line above the list. A dot says a filter is on while the panel is closed. Escape on the
 * button closes an open panel, as it does inside it.
 */
export function FindToggle({
  copy,
  open,
  active,
  onToggle,
  onClose,
}: {
  copy: BoundCopy;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.findToggle}
      data-region="find"
      data-active={active || undefined}
      aria-label={copy.LAYOUT.findAria}
      title={copy.LAYOUT.findAria}
      aria-expanded={open}
      aria-controls={open ? FIND_PANEL_ID : undefined}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        onClose();
      }}
    >
      <Search size={13} aria-hidden />
      {copy.LAYOUT.find}
    </button>
  );
}

/**
 * The panel the button opens, under its line. Opened from the button, it takes the keyboard into its first field as
 * it appears (`focusFirst`, which `onFocused` then clears); the same panel shown again on the other tab leaves focus
 * where it is. Escape, or a choice (see `FindFields`), closes it and hands focus back to the button. A click outside
 * it, once done, closes it too (`onDismiss`), so nothing moves under the pointer while the click is still on its way.
 */
export function FindPanel({
  copy,
  options,
  value,
  focusFirst,
  onFocused,
  onChange,
  onClose,
  onDismiss,
}: {
  copy: BoundCopy;
  options: FilterOptions;
  value: FindValue;
  focusFirst: boolean;
  onFocused: () => void;
  onChange: (patch: FindPatch) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const panel = useRef<HTMLFieldSetElement>(null);
  useLayoutEffect(() => {
    if (!focusFirst) return;
    panel.current?.querySelector<HTMLElement>("select")?.focus({ preventScroll: true });
    onFocused();
  }, [focusFirst, onFocused]);
  // One listener for the panel's life. React's own listener sits on the document too, before it, so a listener swapped
  // while React handles a click (a school chosen re-renders the page) would miss that click.
  const outside = useEffectEvent((event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || panel.current?.contains(target)) return;
    // The button opens and closes the panel itself.
    if (target instanceof Element && target.closest("[data-region=find]")) return;
    onDismiss();
  });
  useEffect(() => {
    const listener = (event: MouseEvent) => outside(event);
    document.addEventListener("click", listener);
    return () => document.removeEventListener("click", listener);
  }, []);
  return (
    <fieldset
      ref={panel}
      id={FIND_PANEL_ID}
      className={styles.findPanel}
      data-region="find-panel"
      onKeyDown={(event) => {
        // A search field clears itself on Escape first; an empty one, or any other field, closes the panel.
        if (event.key !== "Escape") return;
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.value !== "") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <legend className={styles.findLegend}>{copy.LAYOUT.findAria}</legend>
      {/* A district, a name or Enter folds the fields away, so the list is not pushed down on a phone: the line that
          says what is chosen, with Clear, and the button that opens them again stay. */}
      <FindFields copy={copy} options={options} value={value} onChange={onChange} onChosen={onClose} />
    </fieldset>
  );
}

/** What the filter leaves, of how many, and the way to show every school again. */
export function FindStatus({ text, clear, onClear }: { text: string; clear: string; onClear: () => void }) {
  return (
    <p className={`${styles.scopeLine} ${styles.findStatus}`} data-region="find-status">
      <span role="status">{text}</span>{" "}
      <button type="button" className={styles.moreLink} data-region="find-clear" onClick={onClear}>
        {clear}
      </button>
    </p>
  );
}
