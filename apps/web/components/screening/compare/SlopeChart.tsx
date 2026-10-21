"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Compared, ComparedSchool, MoveEdges } from "@/lib/screening/method/compare";
import { moveStep } from "@/lib/screening/method/compare";
import { moveHex } from "@/lib/screening/method/moves";
import {
  type Measure,
  type Suffixes,
  bandTicks,
  fitLabel,
  labelWidth,
  placeLabels,
  slopeFrame,
} from "@/lib/screening/method/slope";
import type { SchoolKey } from "@/lib/screening/types";

import styles from "./compare.module.css";

/** Text widths in `family`, measured once per string, size and weight. */
function createMeasure(family: string): Measure {
  const cache = new Map<string, number>();
  const context = document.createElement("canvas").getContext("2d");
  return (text, size, weight) => {
    const key = `${weight}|${size}|${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      if (!context) return text.length * size * 0.6;
      context.font = `${weight} ${size}px ${family}`;
      width = context.measureText(text).width;
      cache.set(key, width);
    }
    return width;
  };
}

const padRank = (n: number) => String(n);

/**
 * Places under the two rules, one line per school both rules put in order: the top k in full rows with names, the
 * rest compressed below with names only for schools that cross the top-k line (or the largest moves when fewer than
 * four cross), and for the school selected or pointed at. Labels never wrap and never leave the chart (R4); a
 * shortened label keeps the whole name in its title. Lines move to their new places when the pair changes.
 */
export function SlopeChart({
  data,
  names,
  suffixes,
  edges,
  breakLabel,
  label,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  data: Compared;
  /** Each school's display name, the one form every layer uses (R17). */
  names: ReadonlyMap<string, string>;
  suffixes: Suffixes;
  edges: MoveEdges;
  breakLabel: string;
  label: string;
  selected: SchoolKey | null;
  hovered: SchoolKey | null;
  onSelect: (key: SchoolKey) => void;
  onHover: (key: SchoolKey | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [family, setFamily] = useState<string | null>(null);
  const measured = useMemo(() => (family ? createMeasure(family) : null), [family]);
  const measure: Measure = measured ?? ((text, size) => text.length * size * 0.6);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    setWidth(element.clientWidth);
    setFamily(getComputedStyle(element).fontFamily || "sans-serif");
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { k, n, rows, byA, byB, entrants, exits } = data;
  const frame = slopeFrame(k, n);
  const fs = frame.fontSize;
  const nameOf = (r: ComparedSchool) => names.get(r.key) ?? r.name;
  const crossA = new Set(exits.map((r) => r.key));
  const crossB = new Set(entrants.map((r) => r.key));
  const movers =
    exits.length + entrants.length < 4
      ? [...rows]
          .filter((r) => Math.abs(r.d) >= 5)
          .sort((p, q) => Math.abs(q.d) - Math.abs(p.d) || p.name.localeCompare(q.name))
          .slice(0, 4)
          .map((r) => r.key)
      : [];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const pinned = [selected, hovered, ...movers].filter(
    (key): key is SchoolKey => key !== null && byKey.has(key)
  );

  // The name columns take the width their labels need, up to half the chart less the middle's 104 px.
  const cap = Math.max(60, Math.floor((width - 104) / 2));
  let want = 96;
  const need = (r: ComparedSchool, rank: number, off: number, weight: number) =>
    labelWidth(nameOf(r), `  ${padRank(rank)}`, cap, fs, weight, measure, suffixes) + off;
  if (width > 0 && measured) {
    for (const r of rows) {
      if (r.a <= k) want = Math.max(want, need(r, r.a, 8, crossA.has(r.key) ? 600 : 400));
      if (r.b <= k) want = Math.max(want, need(r, r.b, 8, crossB.has(r.key) ? 600 : 400));
      if (r.a > k && (crossB.has(r.key) || pinned.includes(r.key)))
        want = Math.max(want, need(r, r.a, 26, 600));
      if (r.b > k && (crossA.has(r.key) || pinned.includes(r.key)))
        want = Math.max(want, need(r, r.b, 26, 600));
    }
  }
  const xA = Math.min(cap, Math.ceil(want) + 2);
  const xB = width - xA;

  const labels: React.ReactNode[] = [];
  const usedY: Record<"A" | "B", number[]> = { A: [], B: [] };
  const addName = (r: ComparedSchool, side: "A" | "B", y: number, rank: number, emph: boolean, off = 8) => {
    const full = nameOf(r);
    const rankPart = `  ${padRank(rank)}`;
    const avail = (side === "A" ? xA : width - xB) - off;
    const fit = fitLabel(full, rankPart, avail, fs, emph ? 600 : 400, measure, suffixes);
    const on = r.key === selected;
    labels.push(
      <text
        key={`${side}-${r.key}`}
        className={styles.name}
        data-emph={emph || undefined}
        data-on={on || undefined}
        data-hover={r.key === hovered || undefined}
        data-school-key={r.key}
        x={side === "A" ? xA - off : xB + off}
        y={y + fs * 0.35}
        textAnchor={side === "A" ? "end" : "start"}
        style={{ fontSize: fit.size }}
        onClick={() => onSelect(r.key)}
        onPointerEnter={() => onHover(r.key)}
        onPointerLeave={() => onHover(null)}
      >
        <title>{full}</title>
        {side === "A" ? `${fit.text}${rankPart}` : `${padRank(rank)}  ${fit.text}`}
      </text>
    );
  };
  if (width > 0) {
    for (const side of ["A", "B"] as const) {
      const isA = side === "A";
      const axis = isA ? xA : xB;
      const dir = isA ? -1 : 1;
      const rank = (r: ComparedSchool) => (isA ? r.a : r.b);
      for (const r of (isA ? byA : byB).filter((r) => rank(r) <= k))
        addName(r, side, frame.y(rank(r)), rank(r), (isA ? crossA : crossB).has(r.key));
      const wanted = new Set([...(isA ? entrants : exits).map((r) => r.key), ...pinned]);
      const items = [...wanted]
        .map((key) => byKey.get(key)!)
        .filter((r) => rank(r) > k)
        .map((r) => ({ r, y: frame.y(rank(r)) }));
      for (const item of placeLabels(items, frame.zoneTop + 2, frame.height - 6, 12.5)) {
        labels.push(
          <path
            key={`lead-${side}-${item.r.key}`}
            className={styles.leader}
            d={`M${axis + dir * 2},${item.y} L${axis + dir * 13},${item.ly} L${axis + dir * 22},${item.ly}`}
          />
        );
        addName(item.r, side, item.ly, rank(item.r), true, 25);
        usedY[side].push(item.ly);
      }
    }
  }

  const ticks: React.ReactNode[] = [];
  for (const t of bandTicks(k, n))
    for (const side of ["A", "B"] as const) {
      if (usedY[side].some((u) => Math.abs(u - frame.y(t)) < 10)) continue;
      ticks.push(
        <text
          key={`${side}-${t}`}
          className={styles.tick}
          x={side === "A" ? xA - 6 : xB + 6}
          y={frame.y(t) + 3}
          textAnchor={side === "A" ? "end" : "start"}
        >
          {t}
        </text>
      );
    }

  const line = (r: ComparedSchool) => `path("M${xA},${frame.y(r.a)} L${xB},${frame.y(r.b)}")`;
  const ordered = [...rows].sort((p, q) => Math.abs(p.d) - Math.abs(q.d));
  const highlight = [hovered, selected].filter((key): key is SchoolKey => key !== null && byKey.has(key));

  return (
    <div ref={host} className={styles.slopeHost}>
      {width > 0 ? (
        <svg
          className={styles.slope}
          width={width}
          height={frame.height}
          viewBox={`0 0 ${width} ${frame.height}`}
          role="img"
          aria-label={label}
        >
          <defs>
            <clipPath id="screening-slope-lines">
              <rect x={xA} y={0} width={Math.max(0, xB - xA)} height={frame.height} />
            </clipPath>
          </defs>
          <rect
            className={styles.zone}
            x={xA}
            y={frame.top - 2}
            width={Math.max(0, xB - xA)}
            height={Math.min(k, n) * (k === 20 ? 13 : 21) + 4}
          />
          <line className={styles.axis} x1={xA} x2={xA} y1={frame.top} y2={frame.height - 2} />
          <line className={styles.axis} x1={xB} x2={xB} y1={frame.top} y2={frame.height - 2} />
          {n > k ? (
            <>
              <line className={styles.breakLine} x1={0} x2={width} y1={frame.breakY} y2={frame.breakY} />
              <text className={styles.breakText} x={width / 2} y={frame.breakY + 3.5} textAnchor="middle">
                {breakLabel}
              </text>
            </>
          ) : null}
          <g clipPath="url(#screening-slope-lines)">
            {ordered.map((r) => {
              const crosser = r.a <= k !== r.b <= k;
              const low = r.a > k && r.b > k;
              const mover = movers.includes(r.key);
              const step = Math.abs(moveStep(r.d, edges));
              return (
                <path
                  key={r.key}
                  className={styles.line}
                  style={{ d: line(r) } as React.CSSProperties}
                  stroke={moveHex(r.d, edges)}
                  strokeWidth={mover ? 1.75 : crosser ? 2 : low ? 0.9 : r.d === 0 ? 1 : 1.25}
                  strokeOpacity={
                    mover || crosser
                      ? 1
                      : low
                        ? r.d === 0
                          ? 0.35
                          : step === 1
                            ? 0.4
                            : 0.7
                        : r.d === 0
                          ? 0.55
                          : 0.85
                  }
                />
              );
            })}
            {highlight.map((key, i) => (
              <path
                key={`hl-${key}-${i}`}
                className={key === selected ? styles.lineSelected : styles.lineHover}
                d={`M${xA},${frame.y(byKey.get(key)!.a)} L${xB},${frame.y(byKey.get(key)!.b)}`}
              />
            ))}
          </g>
          <g className={styles.hits}>
            {rows.map((r) => (
              <path
                key={r.key}
                d={`M${xA},${frame.y(r.a)} L${xB},${frame.y(r.b)}`}
                onClick={() => onSelect(r.key)}
                onPointerEnter={() => onHover(r.key)}
                onPointerLeave={() => onHover(null)}
              >
                <title>{nameOf(r)}</title>
              </path>
            ))}
          </g>
          <g>{labels}</g>
          <g>{ticks}</g>
        </svg>
      ) : null}
    </div>
  );
}
