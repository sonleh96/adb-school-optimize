"use client";

import { useQuery } from "@tanstack/react-query";
import type { StaticImageData } from "next/image";
import { type CSSProperties, useId, useMemo, useState } from "react";

import { provinceCounts, ranksOf } from "@/lib/explore/province";

import {
  BINS,
  CARD,
  FILLS,
  HATCH,
  LABELS,
  MAP_VIEW,
  PALE_EDGE,
  PROVINCES,
  type ShadeKey,
  type Shape,
  answerOf,
  namedProvinces,
  provinceKey,
  provinceNamed,
  shadeMap,
  shapesIn,
  tableRows,
} from "@/lib/explore/province-map";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { EXPLORE_MAP } from "@/lib/screening/copy/explore-province-map";
import { formatCount } from "@/lib/screening/copy/format";
import type { CopySchool } from "@/lib/screening/copy/model";
import type { ListedRow } from "@/lib/screening/types";
import boundaries from "@/public/images/png-provinces.svg";

import explore from "../explore.module.css";
import styles from "./province-map.module.css";

/** The boundary file, served as a static file: its outlines never ride in the page's script. */
const BOUNDARIES = (boundaries as StaticImageData).src;
const SHADE_ORDER: readonly ShadeKey[] = ["0", ...BINS.map((bin) => bin.key), "none"];
const COLOURS = { "--card": CARD, "--pale-edge": PALE_EDGE, "--hatch": HATCH } as CSSProperties;
/** The question's id, fixed like the other sections' so a link to it holds however the page's tree changes. */
const HEADING_ID = "explore-province-map";

/** Where a point of the boundary file's units sits on the drawing, as a share of its box: the box and the file agree. */
const spot = (x: number, y: number): CSSProperties => ({
  left: `${((x - MAP_VIEW.x) / MAP_VIEW.width) * 100}%`,
  top: `${((y - MAP_VIEW.y) / MAP_VIEW.height) * 100}%`,
});

/** A province's name as the map writes it, with its count of the top 20: a long name in two lines when it must wrap. */
function NameText({ name, count, wrap }: { name: string; count: number; wrap: boolean }) {
  const cut = name.lastIndexOf(" ");
  const tail = (
    <>
      {wrap && cut > 0 ? name.slice(cut + 1) : name} <b>{formatCount(count)}</b>
    </>
  );
  return wrap && cut > 0 ? (
    <>
      <span>{name.slice(0, cut)}</span>
      <span>{tail}</span>
    </>
  ) : (
    tail
  );
}

/** The outlines of the provinces, read once from the static file, by name. */
function useShapes() {
  return useQuery({
    queryKey: ["explore", "province-shapes", BOUNDARIES],
    queryFn: async (): Promise<ReadonlyMap<string, Shape>> => {
      const response = await fetch(BOUNDARIES);
      if (!response.ok) throw new Error(`${BOUNDARIES}: HTTP ${response.status}`);
      const shapes = shapesIn(await response.text());
      if (shapes.length === 0) throw new Error(`${BOUNDARIES}: no named path`);
      return new Map(shapes.map((shape) => [shape.name, shape]));
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Which provinces have schools in the top 20: the answer in a sentence, then the 22 provinces shaded by their count,
 * with a binned legend, the marked school's province outlined, the notes on what the map leaves out, the boundaries'
 * credit and a table of the same counts. The drawing is hidden from assistive technology; the words and the table say
 * everything it shows, and only the table's button takes focus. The words and the table do not wait for the outlines,
 * so a reader who cannot load the drawing still has every count.
 */
export function ProvinceMap({
  rows,
  marked,
  names,
}: {
  /** The rows of the list the page shows, every record of the data among them. */
  rows: readonly ListedRow[];
  /** The school marked across the page, if any. */
  marked: CopySchool | null;
  /** The name the page shows each school of the list by, by its id. */
  names: ReadonlyMap<string, string>;
}) {
  const view = useMemo(() => shadeMap(PROVINCES, provinceCounts(rows)), [rows]);
  const ranges = useMemo(() => ranksOf(rows).reach, [rows]);
  const shapes = useShapes();
  const [open, setOpen] = useState(false);
  const tableId = useId();
  // A fill names its pattern by id in a url(), where the characters useId adds would end the reference.
  const hatchId = `province-hatch-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;

  const answer = answerOf(view);
  const markedProvince = marked ? provinceNamed(view, marked.province) : null;
  // When the marked school's record names no province on the map, its row among those kept aside is tagged instead.
  const markedOff =
    marked && !markedProvince
      ? (view.offMap.find((off) => provinceKey(off.label) === provinceKey(marked.province)) ?? null)
      : null;
  const offSchools = view.offMap.reduce((n, off) => n + off.tally.schools, 0);
  const offTop20 = view.offMap.reduce((n, off) => n + off.tally.top20, 0);
  const shown = new Set(view.provinces.map((p) => p.shade));
  const legend = SHADE_ORDER.filter((key) => key !== "none" || shown.has("none"));
  const fillOf = (shade: ShadeKey) => (shade === "none" ? `url(#${hatchId})` : FILLS[shade]);
  const markedShape = markedProvince ? shapes.data?.get(markedProvince.name) : undefined;
  const named = useMemo(() => namedProvinces(view), [view]);
  const words = EXPLORE_MAP;

  return (
    <section className={explore.section} aria-labelledby={HEADING_ID} data-region="province-map">
      <h2 id={HEADING_ID} className={explore.question}>
        {words.question}
      </h2>
      <p className={explore.sectionLede} data-region="province-map-answer">
        {words.answer(answer.holding, view.provinces.length, answer.leaders, answer.most)}
      </p>
      <p className={styles.location}>{words.location}</p>
      <figure className={styles.card} style={COLOURS} aria-labelledby={HEADING_ID}>
        <div className={styles.legend} data-region="province-map-legend">
          <p className={styles.legendTitle}>{words.legend.title}</p>
          <ul className={styles.keys}>
            {legend.map((key) => (
              <li key={key} data-shade={key}>
                <span
                  className={styles.swatch}
                  data-shade={key}
                  style={key === "none" ? undefined : { background: FILLS[key] }}
                  aria-hidden="true"
                />
                {words.legend.shades[key]}
              </li>
            ))}
            {markedProvince ? (
              <li data-key="marked">
                <span className={styles.swatch} data-marked="" aria-hidden="true" />
                {words.legend.marked}
              </li>
            ) : null}
          </ul>
        </div>
        {/* Names on a map wide enough to hold them; on a narrower one, numbers and a key under the map. */}
        <div className={styles.mapBox}>
          <div
            className={styles.plot}
            style={{ aspectRatio: `${MAP_VIEW.width} / ${MAP_VIEW.height}` }}
            data-state={shapes.data ? "drawn" : shapes.isError ? "failed" : "loading"}
          >
            {shapes.data ? (
              <svg
                className={styles.svg}
                viewBox={`${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.width} ${MAP_VIEW.height}`}
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <pattern
                    id={hatchId}
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect className={styles.hatchGround} width="8" height="8" />
                    <line className={styles.hatch} x1="0" y1="0" x2="0" y2="8" />
                  </pattern>
                </defs>
                <g>
                  {view.provinces.map((province) => {
                    const shape = shapes.data.get(province.name);
                    return shape ? (
                      <path
                        key={province.name}
                        className={styles.province}
                        d={shape.d}
                        fill={fillOf(province.shade)}
                        data-province={province.name}
                        data-shade={province.shade}
                      />
                    ) : null;
                  })}
                </g>
                {/* The two pale shades sit near the card's white, so their edge is drawn over every border they touch. */}
                <g>
                  {view.provinces.map((province) => {
                    const shape = shapes.data.get(province.name);
                    return shape && (province.shade === "0" || province.shade === "none") ? (
                      <path key={province.name} className={styles.paleEdge} d={shape.d} />
                    ) : null;
                  })}
                </g>
                {markedShape ? (
                  <g data-marked-province={markedShape.name}>
                    <path className={styles.halo} d={markedShape.d} />
                    <path className={styles.ring} d={markedShape.d} />
                  </g>
                ) : null}
                <g className={styles.leaders}>
                  {named.map(({ province }) => {
                    const label = LABELS[province.name];
                    // A white line under the ink one keeps the leader seen where it crosses the darkest shade.
                    return label?.off ? (
                      <g key={province.name}>
                        <line
                          className={styles.leaderHalo}
                          x1={label.at[0]}
                          y1={label.at[1]}
                          x2={label.off.x}
                          y2={label.off.y}
                        />
                        <line
                          x1={label.at[0]}
                          y1={label.at[1]}
                          x2={label.off.x}
                          y2={label.off.y}
                          data-leader={province.name}
                        />
                      </g>
                    ) : null;
                  })}
                </g>
              </svg>
            ) : shapes.isError ? (
              <p className={styles.failed} role="status">
                {words.failed}
              </p>
            ) : null}
            {shapes.data ? (
              <>
                <div className={styles.names} aria-hidden="true" data-region="province-map-names">
                  {named.map(({ province }) => {
                    const label = LABELS[province.name];
                    if (!label) return null;
                    const at = label.off ?? { x: label.at[0], y: label.at[1], align: "middle" as const };
                    return (
                      <span key={province.name}>
                        {label.off ? <span className={styles.anchor} style={spot(...label.at)} /> : null}
                        <span
                          className={styles.name}
                          style={spot(at.x, at.y)}
                          data-province={province.name}
                          data-align={at.align}
                        >
                          <NameText
                            name={province.name}
                            count={province.tally!.top20}
                            wrap={label.wrap === true}
                          />
                        </span>
                      </span>
                    );
                  })}
                </div>
                <div className={styles.marks} aria-hidden="true" data-region="province-map-numbers">
                  {named.map(({ province, number }) => {
                    const label = LABELS[province.name];
                    return label ? (
                      <span
                        key={province.name}
                        className={styles.mark}
                        style={spot(...(label.mark ?? label.at))}
                        data-province={province.name}
                      >
                        {number}
                      </span>
                    ) : null;
                  })}
                </div>
              </>
            ) : null}
          </div>
          {shapes.data && named.length > 0 ? (
            <div className={styles.key} aria-hidden="true" data-region="province-map-key">
              <p className={styles.keyTitle}>{words.key}</p>
              <ol className={styles.keyList}>
                {named.map(({ province, number }) => (
                  <li key={province.name} data-province={province.name}>
                    <span className={styles.keyNumber}>{number}</span>
                    <span>
                      {province.name} <b>{formatCount(province.tally!.top20)}</b>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
        {marked ? (
          <p className={explore.chosenLine} data-region="province-map-marked">
            <span className={styles.swatch} data-marked="" aria-hidden="true" />
            <span>
              {markedProvince
                ? words.marked(names.get(marked.id)!, markedProvince.name, markedProvince.tally?.top20 ?? 0)
                : words.markedOff(names.get(marked.id)!)}
            </span>
          </p>
        ) : null}
        {offSchools > 0 ? (
          <p className={explore.note} data-region="province-map-off-map">
            {words.offMap(offSchools, offTop20)}
          </p>
        ) : null}
        {ranges > 0 ? (
          <p className={explore.note} data-region="province-map-ranges">
            {words.ranges(ranges)}
          </p>
        ) : null}
        <p className={styles.credit}>
          <a href={words.credit.href}>{words.credit.text}</a>
        </p>
        <button
          type="button"
          className={explore.toggle}
          aria-expanded={open}
          aria-controls={open ? tableId : undefined}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? EXPLORE.table.hide : EXPLORE.table.show}
        </button>
        {open ? (
          <table id={tableId} className={explore.table} data-region="province-map-table">
            <caption className={explore.srOnly}>{words.table.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{words.table.province}</th>
                <th scope="col">{words.table.top20}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows(view).map((province) => {
                const isMarked = province === markedProvince;
                return (
                  <tr
                    key={province.name}
                    data-province={province.name}
                    data-shade={province.shade}
                    data-marked={isMarked || undefined}
                  >
                    <th scope="row">
                      {province.name}
                      {isMarked ? <span className={explore.marked}>{EXPLORE.table.marked}</span> : null}
                    </th>
                    <td>{province.tally ? formatCount(province.tally.top20) : words.table.none}</td>
                  </tr>
                );
              })}
              {view.offMap.map((off) => (
                <tr key={off.label ?? ""} data-off-map="" data-marked={off === markedOff || undefined}>
                  <th scope="row">
                    {off.label ?? words.table.blank}
                    <span className={explore.marked}>{words.table.offMap}</span>
                    {off === markedOff ? (
                      <span className={explore.marked}>{EXPLORE.table.marked}</span>
                    ) : null}
                  </th>
                  <td>{formatCount(off.tally.top20)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </figure>
    </section>
  );
}
