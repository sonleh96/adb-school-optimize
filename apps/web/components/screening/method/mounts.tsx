"use client";

/**
 * Where the method details meet the workspace. The workspace calls `useMethodMounts` once and puts each returned
 * piece where its plain counterpart goes; a piece is null while the method details are off (or still loading), and
 * the plain one shows. The method layer's code (`layer.ts`) and words (`methodFor`) load on first use, in parallel.
 * Every change goes through the workspace controller, so a guide, a pasted link and a click land on the same screen.
 */
import { Layers } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type BoundCopy, type CopyRuleId, type ListedSchool, RULE_IDS } from "@/lib/screening/copy";
import { type RulePair, useScreeningCompare, useScreeningRules } from "@/lib/screening/hooks";
import type { OrderedRow } from "@/lib/screening/list";
import { LABELLED_PLACES } from "@/lib/screening/marks";
import { type Compared, MOVE_EDGES, compareFor } from "@/lib/screening/method/compare";
import { admits, filterOptions, filtering } from "@/lib/screening/method/filters";
import { type MarkPaint, type Move, NO_PAINT, moveHex } from "@/lib/screening/method/paint";
import type { CopySchool } from "@/lib/screening/copy";
import type { ListedRow, SchoolDetailResponse, SchoolKey } from "@/lib/screening/types";
import type { Band } from "@/lib/screening/workspace/bands";
import type { Layout } from "@/lib/screening/workspace/layout";
import type { MapLayer, WorkspaceState } from "@/lib/screening/workspace/state";
import type { WorkspaceStore } from "@/lib/screening/workspace/store";

import type { RuleChoice } from "../useScreeningData";
import base from "../screening.module.css";
import { MethodSwitch } from "./MethodSwitch";
import { useMethod } from "./useMethod";
import styles from "./method.module.css";

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
  onRule: (rule: CopyRuleId) => void;
}

export interface Mounts {
  /** The method details are drawn. */
  on: boolean;
  methodSwitch: ReactNode;
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

/** The layers the screen has data for. Boundary outlines need an outlines read the screening API does not have. */
const AVAILABLE: readonly MapLayer[] = ["ranked", "numerals", "range", "queue"];

export function useMethodMounts(input: MountInput): Mounts {
  const { store, state, copy, rule, requested, rules, ready, stale, ordered, schools, layer, keyboard } =
    input;
  const { mod, load } = useChunk(loadLayer, state.analyst);
  const comparing = state.mode === "compare";
  const { mod: compareMod } = useChunk(loadCompare, comparing);
  const { method } = useMethod(copy, rule, state.analyst && ready);
  const on = state.analyst && ready && mod !== null && method !== null && rule !== null;

  // Compare mode: the rule compared with (`compare`) and the rule on screen, from the API's comparison of the two.
  const a = (state.compare ?? null) as CopyRuleId | null;
  const pair = comparing && a && rule && a !== rule ? canonicalPair(a, rule) : null;
  const comparison = useScreeningCompare(pair);
  const compared = useMemo((): Compared | null => {
    if (!comparison.data || !a || !rule) return null;
    try {
      return compareFor(comparison.data, a as never, rule as never, state.k);
    } catch {
      // The comparison on hand is of the previous pair; the next one is on its way.
      return null;
    }
  }, [comparison.data, a, rule, state.k]);
  const moves = useMemo((): ReadonlyMap<SchoolKey, Move> | null => {
    if (!compared) return null;
    return new Map(
      compared.rows.map((r) => [
        r.key,
        { hex: moveHex(r.d, MOVE_EDGES), top: r.a <= compared.k || r.b <= compared.k },
      ])
    );
  }, [compared]);
  const detail = useScreeningRules().data?.rules ?? null;
  const filterButton = useRef<HTMLButtonElement>(null);
  const layersButton = useRef<HTMLButtonElement>(null);

  // The filters can only hold a province or remoteness class the list has.
  const options = useMemo(() => filterOptions(input.rows), [input.rows]);
  useEffect(() => {
    if (input.rows.length === 0) return;
    store.setKnown({ provinces: new Set(options.provinces), localities: new Set(options.localities) });
  }, [store, options, input.rows.length]);

  const filters = useMemo(() => ({ prov: state.prov, loc: state.loc }), [state.prov, state.loc]);
  const visible = useMemo(
    () => (filtering(filters) ? ordered.filter((row) => admits(row, filters)) : ordered),
    [ordered, filters]
  );
  const faint = useMemo(() => {
    if (!on || !filtering(filters)) return null;
    return new Set(input.rows.filter((row) => !admits(row, filters)).map((row) => row.school.school_key));
  }, [on, filters, input.rows]);
  const paint = useMemo(
    (): MarkPaint => (on ? { hidden: state.hide, faint, moves: comparing ? moves : null } : NO_PAINT),
    [on, state.hide, faint, comparing, moves]
  );

  const setPop = (pop: WorkspaceState["pop"]) => store.setState({ pop: state.pop === pop ? null : pop });
  const closePop = () => store.setState({ pop: null });

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

  if (!on || !mod || !method || !rule) {
    return {
      on: false,
      methodSwitch,
      ruleArea: null,
      rankedList: null,
      compareColumn: null,
      legend: null,
      mapBar: null,
      paint,
      rootClassName: "",
      cardLayer: null,
    };
  }

  const ruleArea = rules ? (
    <mod.MethodRuleArea
      copy={copy}
      method={method}
      rules={rules}
      detail={detail}
      requested={requested}
      formula={state.formula}
      disabled={!ready}
      onRule={input.onRule}
      onFormula={() => store.setState({ formula: !state.formula })}
      onCompare={() => store.setState({ mode: "compare" })}
    />
  ) : null;

  const rankedList = (
    <>
      <mod.MethodListHead
        copy={copy}
        method={method}
        rule={rule}
        shown={visible.length}
        total={ordered.length}
        hasRanges={ordered.some((row) => row.cohort === "interval")}
        upper={state.place === "upper"}
        filters={filters}
        filterOpen={state.pop === "filter"}
        filterButton={filterButton}
        onFilter={() => setPop("filter")}
        onClear={(key) => store.setState({ [key]: null })}
        onPlace={() => store.setState({ place: state.place === "upper" ? "lower" : "upper" })}
      />
      {state.pop === "filter" ? (
        <mod.Popover
          id="screening-filters"
          anchor={filterButton}
          layer={layer}
          label={copy.TERMS.filters.label}
          align="end"
          width={300}
          instant={keyboard}
          onClose={closePop}
        >
          <mod.FilterPanel
            copy={copy}
            method={method}
            provinces={options.provinces}
            localities={options.localities}
            prov={state.prov}
            loc={state.loc}
            onChange={(patch) => store.setState(patch)}
          />
        </mod.Popover>
      ) : null}
      {visible.length === 0 ? (
        <p className={base.state}>{copy.LAYOUT.emptyFiltered}</p>
      ) : (
        <mod.MethodList
          rows={visible}
          count={ordered.length}
          schools={schools}
          copy={copy}
          method={method}
          rule={rule}
          selected={input.selectedKey}
          hovered={input.hovered}
          busy={stale}
          label={copy.LAYOUT.orderedTab}
          onSelect={input.onSelect}
        />
      )}
    </>
  );

  const complete = ordered.filter((row) => row.cohort === "complete").length;
  const legend = (
    <mod.MethodLegend
      copy={copy}
      method={method}
      rule={rule}
      bands={input.bands}
      numbered={Math.min(LABELLED_PLACES, complete)}
      collapsed={input.layout.keyCollapsed}
      stale={stale}
      ranges={ordered.length - complete}
      incomplete={input.rows.length - ordered.length}
    />
  );

  const hidden = state.hide;
  const mapBar = (
    <div className={`${base.panel} ${styles.mapBar}`} data-region="layers">
      <button
        ref={layersButton}
        type="button"
        className={styles.barButton}
        aria-expanded={state.pop === "layers"}
        aria-controls="screening-layers"
        onClick={() => setPop("layers")}
      >
        <Layers size={14} aria-hidden />
        {copy.TERMS.layers.label}
      </button>
      {state.pop === "layers" ? (
        <mod.Popover
          id="screening-layers"
          anchor={layersButton}
          layer={layer}
          label={copy.TERMS.layers.label}
          width={320}
          instant={keyboard}
          onClose={closePop}
        >
          <mod.LayersPanel
            copy={copy}
            method={method}
            numerals={Math.min(LABELLED_PLACES, complete)}
            hidden={hidden}
            available={AVAILABLE}
            onToggle={(name) =>
              store.setState({
                hide: hidden.includes(name) ? hidden.filter((h) => h !== name) : [...hidden, name],
              })
            }
          />
        </mod.Popover>
      ) : null}
    </div>
  );

  const names = new Map([...schools.values()].map((school) => [school.id, copy.distinctName(school)]));
  const compareColumn =
    comparing && compareMod && a && rules ? (
      <compareMod.CompareColumn
        copy={copy}
        words={method}
        a={a}
        b={rule}
        rules={rules}
        data={compared}
        failed={comparison.isError}
        onRetry={() => void comparison.refetch()}
        names={names}
        count={ordered.length}
        pop={state.pop}
        layer={layer}
        keyboard={keyboard}
        selected={input.selectedKey}
        hovered={input.hovered}
        onState={(patch) => store.setState(patch)}
        onSelect={input.onSelect}
        onHover={(key) => store.setState({ hover: key })}
      />
    ) : null;
  const compareLegend =
    comparing && compared && a ? (
      <mod.CompareLegend
        copy={copy}
        method={method}
        a={a}
        b={rule}
        k={compared.k}
        n={compared.n}
        collapsed={input.layout.keyCollapsed}
        stale={stale}
        ranges={ordered.filter((row) => row.cohort === "interval").length}
        incomplete={input.rows.length - ordered.length}
      />
    ) : null;

  const cardLayer = ({ record, detail: school }: { record: CopySchool; detail: SchoolDetailResponse }) => (
    <mod.MethodCard
      copy={copy}
      method={method}
      rule={rule}
      school={record}
      detail={school}
      rules={detail}
      parts={state.parts}
      onParts={() => store.setState({ parts: !state.parts })}
      compare={
        comparing && compared && a
          ? {
              a,
              b: rule,
              k: compared.k,
              n: compared.n,
              edges: MOVE_EDGES,
              row: compared.rows.find((r) => r.key === record.id) ?? null,
            }
          : null
      }
    />
  );

  return {
    on: true,
    cardLayer,
    methodSwitch,
    ruleArea,
    rankedList,
    compareColumn,
    legend: compareLegend ?? legend,
    mapBar,
    paint,
    rootClassName: `${styles.methodRoot} ${state.mode === "compare" ? styles.compareRoot : ""}`,
  };
}
