"use client";

/**
 * The method layer's pieces, built once its code and words are on hand. This module is in the method layer's chunk
 * (`layer.ts`), so the workspace's up-front script carries only the hooks in `mounts.tsx` that call it.
 * Every function here is plain: no hooks, so whether the chunk has loaded never changes the order of React's hooks.
 */
import { Layers } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import type { CopyRuleId, CopySchool, ListedSchool } from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import { LABELLED_PLACES } from "@/lib/screening/marks";
import { type Compared, compareFor } from "@/lib/screening/method/compare";
import { admits, filterOptions, filtering } from "@/lib/screening/method/filters";
import type { CompareResponse, Rule, RuleId, SchoolDetailResponse } from "@/lib/screening/types";
import type { MapLayer, WorkspaceState } from "@/lib/screening/workspace/state";

import type { MountInput } from "./mounts";
import base from "../screening.module.css";
import { CompareLegend, MethodLegend } from "./MethodLegend";
import { MethodList, MethodListHead } from "./MethodList";
import { MethodCard } from "./MethodCard";
import { FilterPanel, LayersPanel } from "./MapOptions";
import { MethodRuleArea } from "./MethodRuleArea";
import { Popover } from "./Popover";
import styles from "./method.module.css";

export { filterOptions };
export { paintFor } from "@/lib/screening/method/paint-for";

/** The layers the screen has data for. Boundary outlines need an outlines read the screening API does not have. */
const AVAILABLE: readonly MapLayer[] = ["ranked", "numerals", "range", "queue"];

/** The comparison turned to the screen's order, or null when the one on hand is of another pair. */
export function comparedOf(
  response: CompareResponse,
  a: CopyRuleId,
  b: CopyRuleId,
  k: number
): Compared | null {
  try {
    return compareFor(response, a as RuleId, b as RuleId, k);
  } catch {
    // The comparison on hand is of the previous pair; the next one is on its way.
    return null;
  }
}

export interface BuildInput extends MountInput {
  method: Method;
  rule: CopyRuleId;
  /** The API's rules, for each one's formula and shares. */
  detail: readonly Rule[] | null;
  compareColumn: (props: { compared: Compared | null; names: ReadonlyMap<string, string> }) => ReactNode;
  compared: Compared | null;
  filterButton: RefObject<HTMLButtonElement | null>;
  layersButton: RefObject<HTMLButtonElement | null>;
}

export interface Built {
  ruleArea: ReactNode | null;
  rankedList: ReactNode;
  compareColumn: ReactNode | null;
  legend: ReactNode;
  mapBar: ReactNode;
  rootClassName: string;
  cardLayer: (input: { record: CopySchool; detail: SchoolDetailResponse }) => ReactNode;
}

export function buildMounts(input: BuildInput): Built {
  const { store, state, copy, method, rule, rules, ordered, schools, layer, keyboard, stale, compared } =
    input;
  const comparing = state.mode === "compare";
  const a = (state.compare ?? null) as CopyRuleId | null;
  const setPop = (pop: WorkspaceState["pop"]) => store.setState({ pop: state.pop === pop ? null : pop });
  const closePop = () => store.setState({ pop: null });
  const filters = { prov: state.prov, loc: state.loc };
  const visible = filtering(filters) ? ordered.filter((row) => admits(row, filters)) : ordered;
  const options = filterOptions(input.rows);
  const complete = ordered.filter((row) => row.cohort === "complete").length;
  const numerals = Math.min(LABELLED_PLACES, complete);

  const ruleArea = rules ? (
    <MethodRuleArea
      copy={copy}
      method={method}
      rules={rules}
      detail={input.detail}
      requested={input.requested}
      formula={state.formula}
      disabled={!input.ready}
      onRule={input.onRule}
      onFormula={() => store.setState({ formula: !state.formula })}
      onCompare={() => store.setState({ mode: "compare" })}
    />
  ) : null;

  const rankedList = (
    <>
      <MethodListHead
        copy={copy}
        method={method}
        rule={rule}
        shown={visible.length}
        total={ordered.length}
        hasRanges={ordered.some((row) => row.cohort === "interval")}
        upper={state.place === "upper"}
        filters={filters}
        filterOpen={state.pop === "filter"}
        filterButton={input.filterButton}
        onFilter={() => setPop("filter")}
        onClear={(key) => store.setState({ [key]: null })}
        onPlace={() => store.setState({ place: state.place === "upper" ? "lower" : "upper" })}
      />
      {state.pop === "filter" ? (
        <Popover
          id="screening-filters"
          anchor={input.filterButton}
          layer={layer}
          label={copy.TERMS.filters.label}
          align="end"
          width={300}
          instant={keyboard}
          onClose={closePop}
        >
          <FilterPanel
            copy={copy}
            method={method}
            provinces={options.provinces}
            localities={options.localities}
            prov={state.prov}
            loc={state.loc}
            onChange={(patch) => store.setState(patch)}
          />
        </Popover>
      ) : null}
      {visible.length === 0 ? (
        <p className={base.state}>{copy.LAYOUT.emptyFiltered}</p>
      ) : (
        <MethodList
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

  const counts = {
    collapsed: input.layout.keyCollapsed,
    stale,
    ranges: ordered.length - complete,
    incomplete: input.rows.length - ordered.length,
  };
  const legend =
    comparing && compared && a ? (
      <CompareLegend copy={copy} method={method} a={a} b={rule} k={compared.k} n={compared.n} {...counts} />
    ) : (
      <MethodLegend
        copy={copy}
        method={method}
        rule={rule}
        bands={input.bands}
        numbered={numerals}
        {...counts}
      />
    );

  const hidden = state.hide;
  const mapBar = (
    <div className={`${base.panel} ${styles.mapBar}`} data-region="layers">
      <button
        ref={input.layersButton}
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
        <Popover
          id="screening-layers"
          anchor={input.layersButton}
          layer={layer}
          label={copy.TERMS.layers.label}
          width={320}
          instant={keyboard}
          onClose={closePop}
        >
          <LayersPanel
            copy={copy}
            method={method}
            numerals={numerals}
            hidden={hidden}
            available={AVAILABLE}
            onToggle={(name) =>
              store.setState({
                hide: hidden.includes(name) ? hidden.filter((h) => h !== name) : [...hidden, name],
              })
            }
          />
        </Popover>
      ) : null}
    </div>
  );

  const names = new Map(
    [...schools.values()].map((school: ListedSchool) => [school.id, copy.distinctName(school)])
  );
  const compareColumn = comparing ? input.compareColumn({ compared, names }) : null;

  const cardLayer = ({ record, detail }: { record: CopySchool; detail: SchoolDetailResponse }) => (
    <MethodCard
      copy={copy}
      method={method}
      rule={rule}
      school={record}
      detail={detail}
      rules={input.detail}
      parts={state.parts}
      onParts={() => store.setState({ parts: !state.parts })}
      compare={
        comparing && compared && a
          ? {
              a,
              b: rule,
              k: compared.k,
              n: compared.n,
              edges: method.compare.moveEdges,
              row: compared.rows.find((r) => r.key === record.id) ?? null,
            }
          : null
      }
    />
  );

  return {
    ruleArea,
    rankedList,
    compareColumn,
    legend,
    mapBar,
    rootClassName: `${styles.methodRoot} ${comparing ? styles.compareRoot : ""}`,
    cardLayer,
  };
}
