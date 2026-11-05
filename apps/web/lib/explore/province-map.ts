/**
 * The province map on the explore page (components/explore/sections/ProvinceMap.tsx): the 22 provinces of the
 * boundary file, each shaded by how many schools of the top 20 its records name. Pure, so the map, its legend, its
 * table and their tests read one answer.
 *
 * Each province takes one of seven shades, kept apart: 0, when schools of the data name it and none is in the top 20;
 * one of five bins of its count (1, 2, 3, 4, and 5 or more) on the even ramp, from light to dark; or none, when no
 * school of the data names it at all. A school is matched to a province by the name its record gives, in any case and
 * spacing. A name that matches no province, or a blank one, is kept aside with its counts and said under the map:
 * the map never drops a school silently, and never shows a province as empty when its schools are spelt otherwise.
 */
import { cleanedOrNull } from "@/lib/screening/copy/format";
import { RAMP_HEX } from "@/lib/screening/marks";

import { type ProvinceCount, waiting } from "./province";

/** A province's schools in the data, in the list or not, and how many of them are in the top 20. */
export interface ProvinceTally {
  readonly schools: number;
  readonly top20: number;
}

/** The key two spellings of one province share: spaces trimmed and collapsed, case ignored. Null for a blank name. */
export const provinceKey = (name: string | null): string | null =>
  cleanedOrNull(name)?.toLocaleLowerCase("en") ?? null;

/**
 * The 22 provinces the map draws, by the names the World Bank's boundary file gives them (public/images/png-provinces.svg,
 * in the order of their codes). They are also the names the study's data uses: the paper's province table (Appendix
 * E1) and the preview database on 5 November 2026 hold exactly these 22. A test fails if the boundary file draws any
 * other set, or if the province-map test dataset names a province outside it.
 */
export const PROVINCES: readonly string[] = [
  "Bougainville",
  "Central",
  "Chimbu",
  "East New Britain",
  "East Sepik",
  "Eastern Highlands",
  "Enga",
  "Gulf",
  "Hela",
  "Jiwaka",
  "Madang",
  "Manus",
  "Milne Bay",
  "Morobe",
  "National Capital District",
  "New Ireland",
  "Northern",
  "Sandaun",
  "Southern Highlands",
  "West New Britain",
  "Western",
  "Western Highlands",
];

/** A province as the boundary file draws it: its World Bank code, its name and its outline. */
export interface Shape {
  readonly id: string;
  readonly name: string;
  readonly d: string;
}

/** The provinces in a boundary file's text: every path that carries a name. Empty when the text is not an SVG. */
export function shapesIn(svg: string): Shape[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) return [];
  return [...doc.querySelectorAll("path[data-name]")].flatMap((path) => {
    const name = path.getAttribute("data-name");
    const d = path.getAttribute("d");
    return name && d ? [{ id: path.id, name, d }] : [];
  });
}

/**
 * The part of the boundary file the map shows, in the file's units: every province with a little room round it. The
 * file's own frame also reaches far east, to atolls too small to draw, and the map does not spend a phone's width on
 * that empty sea. Fixed here rather than measured once the file arrives, so the map's box never changes size as it
 * loads; a test holds it to the file's drawn extent.
 */
export const MAP_VIEW = { x: -6, y: 24, width: 823, height: 569 } as const;

/** A shade of the map, in the legend's order: the count bins from 0 up, then no school in the data. */
export type ShadeKey = "0" | "1" | "2" | "3" | "4" | "5+" | "none";

/** The count bins: each holds the counts from `least` up to the next bin's, and the last has no top. */
export const BINS: readonly { readonly key: Exclude<ShadeKey, "0" | "none">; readonly least: number }[] = [
  { key: "1", least: 1 },
  { key: "2", least: 2 },
  { key: "3", least: 3 },
  { key: "4", least: 4 },
  { key: "5+", least: 5 },
];
/**
 * The fill of each shade with a count: the bins take the even ramp, the lightest for the fewest, and 0 a pale tint
 * below it, 3.2:1 against the lightest bin. The shade for none is a hatching the map draws itself.
 */
export const FILLS: Readonly<Record<Exclude<ShadeKey, "none">, string>> = {
  "0": "#dde4ef",
  "1": RAMP_HEX[4],
  "2": RAMP_HEX[3],
  "3": RAMP_HEX[2],
  "4": RAMP_HEX[1],
  "5+": RAMP_HEX[0],
};
/**
 * The edge round the two pale shades, 0 and none. Both sit near the card's white, so this line, 4.4:1 on white and
 * 3.5:1 on the 0 tint, is what draws them.
 */
export const PALE_EDGE = "#6f7889";
/**
 * The hatching that tells none from 0, 3.1:1 on the white it is drawn over: the 0 tint is only 1.3:1 on white, so the
 * hatching is the cue that keeps the two apart, and it holds 3:1 as a mark must. It stays lighter than the edge, which
 * draws the province.
 */
export const HATCH = "#8a92a0";
/** The card the map sits on, and the gap between two provinces: every bin's fill is at least 4:1 against it. */
export const CARD = "#ffffff";

/** The shade of a province with this tally; no tally means no school of the data names it. */
export function shadeOf(tally: ProvinceTally | null): ShadeKey {
  if (!tally || tally.schools === 0) return "none";
  if (tally.top20 === 0) return "0";
  return [...BINS].reverse().find((bin) => tally.top20 >= bin.least)!.key;
}

/** A province of the map with its tally and its shade. */
export interface ShadedProvince {
  readonly name: string;
  /** Null when no school of the data names the province. */
  readonly tally: ProvinceTally | null;
  readonly shade: ShadeKey;
}

/** A province name in the data that is on no shape of the map, as the records first spell it; null when blank. */
export interface OffMap {
  readonly label: string | null;
  readonly tally: ProvinceTally;
}

export interface MapView {
  /** One per province of the map, in the order of its names. */
  readonly provinces: readonly ShadedProvince[];
  /** The data's province names that match no shape, in the order the data first gives them. */
  readonly offMap: readonly OffMap[];
}

const add = (a: ProvinceTally | null | undefined, b: ProvinceTally): ProvinceTally => ({
  schools: (a?.schools ?? 0) + b.schools,
  top20: (a?.top20 ?? 0) + b.top20,
});

/**
 * The map's provinces, each with the counts of every spelling of its name, and the counts that match no province. A
 * province's schools are those of the list and those not in it yet, so one whose schools all wait still has schools.
 * Two spellings of one name add up; a blank name and a name the map does not have are kept aside, each once.
 */
export function shadeMap(names: readonly string[], counts: readonly ProvinceCount[]): MapView {
  const onShape = new Map(names.map((name) => [provinceKey(name), null as ProvinceTally | null]));
  const off = new Map<string | null, OffMap>();
  for (const count of counts) {
    const label = count.province;
    const tally = { schools: count.inList + waiting(count.notYet), top20: count.top20 };
    const key = provinceKey(label);
    if (key !== null && onShape.has(key)) onShape.set(key, add(onShape.get(key), tally));
    else {
      const was = off.get(key);
      off.set(key, { label: was ? was.label : cleanedOrNull(label), tally: add(was?.tally, tally) });
    }
  }
  return {
    provinces: names.map((name) => {
      const tally = onShape.get(provinceKey(name)) ?? null;
      return { name, tally, shade: shadeOf(tally) };
    }),
    offMap: [...off.values()],
  };
}

/** The province of the map a school's record names, or null when it names none of them. */
export const provinceNamed = (view: MapView, province: string | null): ShadedProvince | null => {
  const key = provinceKey(province);
  return key === null ? null : (view.provinces.find((p) => provinceKey(p.name) === key) ?? null);
};

/** The table's rows: provinces with schools in the top 20 first, most first, then by name; those with none last. */
export function tableRows(view: MapView): readonly ShadedProvince[] {
  const order = (p: ShadedProvince) => (p.tally === null ? -1 : p.tally.top20);
  return [...view.provinces].sort((a, b) => order(b) - order(a) || a.name.localeCompare(b.name, "en"));
}

/** What the sentence over the map says: how many provinces hold schools of the top 20, and which hold the most. */
export function answerOf(view: MapView): {
  readonly holding: number;
  readonly most: number;
  readonly leaders: string[];
} {
  const holding = view.provinces.filter((p) => (p.tally?.top20 ?? 0) > 0);
  const most = Math.max(0, ...holding.map((p) => p.tally!.top20));
  return {
    holding: holding.length,
    most,
    leaders: holding
      .filter((p) => p.tally!.top20 === most)
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, "en")),
  };
}

/**
 * Where the map names a province, in the boundary file's units, for every province of the map. The layout is fixed, so
 * whichever provinces hold schools of the top 20, no two names cover each other: a browser test draws the hardest set
 * at the narrowest map that shows names.
 *
 * - `at`: a point inside the province. A name sits centred on it, on the province's own shape.
 * - `off`: for a shape too small or too crowded to hold its name (the islands, the National Capital District, a few in
 *   the highlands), the name sits here instead, aligned by `align`, with a thin line to `at`.
 * - `wrap`: a long name set in two lines, so it fits its shape.
 * - `mark`: where a phone puts the province's number instead of its name, when it differs from `at`. Every number is at
 *   least 42 units from every other, 15 px on a 360 px phone, so no two 14 px numbers touch.
 */
export interface ProvinceLabel {
  readonly at: readonly [number, number];
  readonly off?: { readonly x: number; readonly y: number; readonly align: "start" | "middle" | "end" };
  readonly wrap?: true;
  readonly mark?: readonly [number, number];
}
export const LABELS: Readonly<Record<string, ProvinceLabel>> = {
  Bougainville: { at: [790, 311], off: { x: 742, y: 350, align: "end" } },
  Central: { at: [340, 425] },
  Chimbu: { at: [216, 300], mark: [228, 299] },
  "East New Britain": { at: [600, 215], off: { x: 592, y: 306, align: "middle" } },
  "East Sepik": { at: [112, 200] },
  "Eastern Highlands": { at: [262, 330], mark: [262, 331], wrap: true },
  Enga: { at: [140, 250], mark: [138, 243] },
  Gulf: { at: [198, 340] },
  Hela: { at: [108, 282], mark: [84, 252] },
  Jiwaka: { at: [205, 271], mark: [207, 261] },
  Madang: { at: [250, 234] },
  Manus: { at: [326, 72], off: { x: 362, y: 72, align: "start" } },
  "Milne Bay": { at: [467, 488], off: { x: 480, y: 566, align: "middle" } },
  Morobe: { at: [322, 356] },
  "National Capital District": { at: [341, 468], off: { x: 330, y: 548, align: "middle" } },
  "New Ireland": { at: [645, 190], off: { x: 668, y: 172, align: "start" } },
  Northern: { at: [400, 445] },
  Sandaun: { at: [44, 158] },
  "Southern Highlands": { at: [148, 309], mark: [138, 309], wrap: true },
  "West New Britain": { at: [482, 272] },
  Western: { at: [53, 335] },
  "Western Highlands": {
    at: [180, 254],
    off: { x: 182, y: 226, align: "middle" },
    mark: [168, 278],
    wrap: true,
  },
};

/** The provinces the map names: each with schools of the top 20, most first and then by name, numbered from 1. */
export function namedProvinces(
  view: MapView
): { readonly province: ShadedProvince; readonly number: number }[] {
  return tableRows(view)
    .filter((p) => (p.tally?.top20 ?? 0) > 0)
    .map((province, i) => ({ province, number: i + 1 }));
}
