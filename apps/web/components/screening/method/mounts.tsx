"use client";

/**
 * Where the method details and the export sheet meet the workspace. The workspace calls `useMethodMounts` once and puts
 * each returned piece where its plain counterpart goes; a method piece is null while the method details are off (or
 * still loading), and the plain one shows. This file is in the workspace's up-front script, so it holds only hooks and
 * the two buttons that are always on screen: the method layer (`layer.ts`, built by `build.tsx`), compare mode and
 * the export sheet each load in their own chunk on first use, and the method words through the copy's `methodFor`.
 * Every change goes through the workspace controller, so a guide, a pasted link and a click land on the same screen.
 */
import { Download } from "lucide-react";
import { type ReactNode, createRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type BoundCopy,
  type CopyRuleId,
  type CopySchool,
  type ListedSchool,
  RULE_IDS,
} from "@/lib/screening/copy";
import { type RulePair, useScreeningCompare, useScreeningRules } from "@/lib/screening/hooks";
import type { OrderedRow } from "@/lib/screening/list";
import { type MarkPaint, NO_PAINT } from "@/lib/screening/method/paint";
import type { ListedRow, SchoolDetailResponse, SchoolKey } from "@/lib/screening/types";
import type { Band } from "@/lib/screening/workspace/bands";
import type { Layout } from "@/lib/screening/workspace/layout";
import type { WorkspaceState } from "@/lib/screening/workspace/state";
import type { WorkspaceStore } from "@/lib/screening/workspace/store";

import type { RuleChoice } from "../useScreeningData";
import styles from "./actions.module.css";
import { MethodSwitch } from "./MethodSwitch";
import { useMethod } from "./useMethod";

/** Loads a chunk once; a failed load is tried again on the next call. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    }));
}
const loadLayer = once(() => import("./layer"));
const loadCompare = once(() => import("../compare/layer"));
const loadExport = once(() => import("../export/layer"));

/** A chunk's exports, once `wanted` has held or `load` has been called (the switch pointed at, for one). */
function useChunk<T>(load: () => Promise<T>, wanted: boolean) {
  const [mod, setMod] = useState<T | null>(null);
  const start = useCallback(() => {
    void load().then(setMod, (error: unknown) => console.error(error));
  }, [load]);
  useEffect(() => {
    if (wanted && !mod) start();
  }, [wanted, mod, start]);
  return { mod, load: start };
}

/** Two rules in the rules' own order, the order the app asks the API for a comparison in. */
function canonicalPair(x: CopyRuleId, y: CopyRuleId): RulePair {
  const order = (id: CopyRuleId) => RULE_IDS.indexOf(id);
  return (order(x) <= order(y) ? { a: x, b: y } : { a: y, b: x }) as RulePair;
}

export interface MountInput {
  store: WorkspaceStore;
  state: WorkspaceState;
  copy: BoundCopy;
  /** The rule of the rows on screen, and the rule asked for (the switch shows it at once). */
  rule: CopyRuleId | null;
  requested: CopyRuleId;
  rules: readonly RuleChoice[] | null;
  /** The list and its data are on screen. */
  ready: boolean;
  stale: boolean;
  rows: readonly ListedRow[];
  ordered: readonly OrderedRow[];
  schools: ReadonlyMap<string, ListedSchool>;
  selectedKey: SchoolKey | null;
  hovered: SchoolKey | null;
  layer: HTMLElement | null;
  layout: Layout;
  bands: readonly Band[];
  /** The last action came from the keyboard: popovers appear at once. */
  keyboard: boolean;
  onSelect: (key: SchoolKey) => void;
  /** The school under the pointer, kept out of the workspace's state like the map's (the guides own `hover`). */
  onPointerHover: (key: SchoolKey | null) => void;
  onRule: (rule: CopyRuleId) => void;
  /** Says something briefly in the workspace's status line (a download, a copied record). */
  onNotify: (message: string) => void;
}

export interface Mounts {
  /** The method details are drawn. */
  on: boolean;
  methodSwitch: ReactNode;
  /** "Download the top list", in the actions, and the compact one for the narrow top bar. */
  exportButton: ReactNode;
  exportIcon: ReactNode;
  /** The export sheet while it is open. */
  exportSheet: ReactNode | null;
  ruleArea: ReactNode | null;
  rankedList: ReactNode | null;
  /** Compare mode's column, which replaces the rule, the tabs and the list. */
  compareColumn: ReactNode | null;
  legend: ReactNode | null;
  mapBar: ReactNode | null;
  paint: MarkPaint;
  rootClassName: string;
  /** The card's method layer, given the school's whole record. */
  cardLayer: ((input: { record: CopySchool; detail: SchoolDetailResponse }) => ReactNode) | null;
}

export function useMethodMounts(input: MountInput): Mounts {
  const { store, state, copy, rule, ready } = input;
  const comparing = state.mode === "compare";
  const exporting = state.panel === "export" && ready && rule !== null;
  const { mod, load } = useChunk(loadLayer, state.analyst);
  const { mod: compareMod } = useChunk(loadCompare, comparing);
  const { mod: exportMod, load: loadSheet } = useChunk(loadExport, exporting);
  const { method } = useMethod(copy, rule, state.analyst && ready);
  const on = state.analyst && ready && mod !== null && method !== null && rule !== null;
  const detail = useScreeningRules().data?.rules ?? null;
  // Held in state, not useRef: they go to the method chunk's builder as plain objects for its buttons to fill.
  const [filterButton] = useState(() => createRef<HTMLButtonElement>());
  const [layersButton] = useState(() => createRef<HTMLButtonElement>());
  const exportOpener = useRef<HTMLButtonElement>(null);

  // The filters can only hold a province or remoteness class the list has.
  const { rows } = input;
  useEffect(() => {
    if (!mod || rows.length === 0) return;
    const options = mod.filterOptions(rows);
    store.setKnown({ provinces: new Set(options.provinces), localities: new Set(options.localities) });
  }, [store, mod, rows]);

  // Compare mode: the rule compared with (`compare`) and the rule on screen, from the API's comparison of the two.
  const a = (state.compare ?? null) as CopyRuleId | null;
  const pair = comparing && a && rule && a !== rule ? canonicalPair(a, rule) : null;
  const comparison = useScreeningCompare(pair);
  const compared = useMemo(
    () => (mod && comparison.data && a && rule ? mod.comparedOf(comparison.data, a, rule, state.k) : null),
    [mod, comparison.data, a, rule, state.k]
  );
  const paint = useMemo(
    (): MarkPaint =>
      on && mod
        ? mod.paintFor({
            hide: state.hide,
            rows,
            filters: { prov: state.prov, loc: state.loc },
            compared: comparing ? compared : null,
          })
        : NO_PAINT,
    [on, mod, state.hide, state.prov, state.loc, rows, comparing, compared]
  );

  const methodSwitch = (
    <MethodSwitch
      label={copy.LAYOUT.methodSwitch}
      on={state.analyst}
      disabled={!ready}
      title={ready ? undefined : copy.LAYOUT.availableAfterLoad}
      onIntent={load}
      onToggle={() => store.setState({ analyst: !state.analyst })}
    />
  );

  const openSheet = () => store.setState({ panel: "export", pop: null });
  const exportButton = (
    <button
      ref={exportOpener}
      type="button"
      className={styles.open}
      data-region="export-button"
      disabled={!ready}
      title={ready ? undefined : copy.LAYOUT.availableAfterLoad}
      aria-haspopup="dialog"
      aria-expanded={state.panel === "export"}
      onPointerEnter={loadSheet}
      onFocus={loadSheet}
      onClick={openSheet}
    >
      {copy.TERMS.export.label}
    </button>
  );
  const exportIcon = (
    <button
      type="button"
      className={`${styles.open} ${styles.openIcon}`}
      disabled={!ready}
      aria-label={copy.TERMS.export.label}
      title={copy.TERMS.export.label}
      aria-haspopup="dialog"
      onClick={openSheet}
    >
      <Download size={15} aria-hidden />
    </button>
  );
  const exportSheet =
    exporting && exportMod && rule ? (
      <exportMod.ExportSheet
        copy={copy}
        method={on ? method : null}
        rule={rule}
        comparedWith={comparing && on ? a : null}
        n={state.n}
        schools={input.schools}
        layer={input.layer}
        instant={input.keyboard}
        onLength={(n) => store.setState({ n })}
        onClose={() => {
          store.setState({ panel: null });
          // The sheet leaves the page as it closes, so focus goes back to the button that opened it.
          requestAnimationFrame(() => exportOpener.current?.focus({ preventScroll: true }));
        }}
        onNotify={input.onNotify}
      />
    ) : null;

  const common = { on, methodSwitch, exportButton, exportIcon, exportSheet, paint };
  if (!on || !mod || !method || !rule) {
    return {
      ...common,
      on: false,
      ruleArea: null,
      rankedList: null,
      compareColumn: null,
      legend: null,
      mapBar: null,
      rootClassName: "",
      cardLayer: null,
    };
  }

  const built = mod.buildMounts({
    ...input,
    method,
    rule,
    detail,
    compared,
    filterButton,
    layersButton,
    compareColumn: ({ compared: data, names }) =>
      compareMod && a && input.rules ? (
        <compareMod.CompareColumn
          copy={copy}
          words={method}
          a={a}
          b={rule}
          rules={input.rules}
          data={data}
          failed={comparison.isError}
          onRetry={() => void comparison.refetch()}
          names={names}
          count={input.ordered.length}
          pop={state.pop}
          layer={input.layer}
          keyboard={input.keyboard}
          selected={input.selectedKey}
          hovered={input.hovered}
          onState={(patch) => store.setState(patch)}
          onSelect={input.onSelect}
          onHover={input.onPointerHover}
        />
      ) : null,
  });
  return { ...common, ...built };
}
