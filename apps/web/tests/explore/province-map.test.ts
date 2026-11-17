/**
 * The province map's boundary file and its pure logic (public/images/png-provinces.svg, lib/explore/province-map.ts).
 * Failure modes, each with the test that catches it:
 *  1. A province name is unmatched: the boundary file draws a name the data does not use, misses one, or draws one
 *     twice; or a test dataset names a province the map does not have
 *                                    -> "draws exactly the 22 provinces the data names, ..." and
 *                                       "every province the province-map dataset names is on the map"
 *  2. The map's frame cuts off a province, or leaves a phone's width to empty sea
 *                                    -> "frames every province with a little room and no more"
 *  3. A shade falls below 3:1 against the card or the gap between provinces, or 0 reads as the lightest bin
 *                                    -> "keeps every shade at 3:1 against the card, ..."
 *  4. 0 is shaded as no school in the data, or the reverse, or a count falls in another bin than the legend states;
 *     or a province whose records all wait to be verified reads as having no school
 *                                    -> "shades 0 apart from no school in the data, and each count in its bin"
 *  5. A school whose province is spelt otherwise, unknown or blank is dropped, or a province is shown as empty when
 *     its schools are spelt otherwise -> "adds up the spellings of one province, and keeps unknown and blank ..."
 *  6. The sentence over the map names the wrong provinces or misses a tie
 *                                    -> "names every province that holds the most"
 *  7. 0 and no school in the data differ only by cues under 3:1, so a reader with low contrast sensitivity takes a
 *     province with no school in the data for 0 -> "tells 0 from no school in the data by a hatch of 3:1 or more"
 *  8. A province's name or number points into another province, or a province has no place for its name; or two of a
 *     phone's numbers sit close enough to touch; or the numbers do not run most first
 *                                    -> "places every province's name and number inside it, ..." and
 *                                       "numbers the provinces with schools in the top 20, most first"
 * Which schools count in the top 20 is E3's `provinceCounts` and its tests (lib/explore/province.ts); the browser test
 * counts from the fixture's own rows. Where each province is drawn is checked in the browser, against a town in each
 * (e2e/explore-province-map.spec.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BINS,
  CARD,
  FILLS,
  HATCH,
  LABELS,
  MAP_VIEW,
  PALE_EDGE,
  PROVINCES,
  answerOf,
  namedProvinces,
  provinceKey,
  provinceNamed,
  shadeMap,
  shadeOf,
  shapesIn,
  tableRows,
} from "@/lib/explore/province-map";
import type { ProvinceCount } from "@/lib/explore/province";
import { contrastRatio } from "@/lib/screening/contrast";

/** A province's counts as E3's `provinceCounts` gives them: in the list, in the top 20, and waiting, all as one reason. */
const counted = (province: string | null, inList: number, top20: number, waiting = 0): ProvinceCount => ({
  province,
  inList,
  top20,
  notYet: { missingField: waiting, zeroClassrooms: 0, other: 0 },
});
const WEB = path.resolve(__dirname, "../..");
const BOUNDARIES = readFileSync(path.join(WEB, "public/images/png-provinces.svg"), "utf8");

/**
 * The province names the study's data uses, as the paper's province table lists them (Appendix Table E1) and as the
 * preview database held them on 5 November 2026: written out here, apart from the module's list, so a change to
 * either is caught.
 */
const DATA_NAMES = [
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

describe("the boundary file", () => {
  it("draws exactly the 22 provinces the data names, each once, with its World Bank code", () => {
    const shapes = shapesIn(BOUNDARIES);
    const names = shapes.map((s) => s.name);
    expect([...names].sort()).toEqual([...DATA_NAMES].sort());
    expect([...PROVINCES].sort()).toEqual([...DATA_NAMES].sort());
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
    for (const shape of shapes) {
      expect(shape.id, shape.name).toMatch(/^PNG\d{3}$/);
      expect(shape.d, shape.name).toMatch(/^M\d+,\d+(?:L\d+,\d+)+Z/);
    }
  });

  it("every province the province-map dataset names is on the map", () => {
    const rows: { school: { province: string | null } }[] = JSON.parse(
      readFileSync(path.join(WEB, "e2e/fixtures/screening/province-map/results/additive_no_u.json"), "utf8")
    ).rows;
    const onMap = new Set(PROVINCES.map(provinceKey));
    const unmatched = [...new Set(rows.map((r) => r.school.province))].filter(
      (p) => !onMap.has(provinceKey(p))
    );
    expect(unmatched).toEqual([]);
  });

  it("frames every province with a little room and no more", () => {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const shape of shapesIn(BOUNDARIES))
      for (const [, x, y] of shape.d.matchAll(/(\d+),(\d+)/g)) {
        left = Math.min(left, Number(x));
        right = Math.max(right, Number(x));
        top = Math.min(top, Number(y));
        bottom = Math.max(bottom, Number(y));
      }
    const room = [
      left - MAP_VIEW.x,
      top - MAP_VIEW.y,
      MAP_VIEW.x + MAP_VIEW.width - right,
      MAP_VIEW.y + MAP_VIEW.height - bottom,
    ];
    for (const side of room) {
      expect(side).toBeGreaterThanOrEqual(2);
      expect(side).toBeLessThanOrEqual(8);
    }
  });
});

describe("the map's colours", () => {
  it("keeps every shade at 3:1 against the card, and 0 at 3:1 against the lightest bin", () => {
    for (const bin of BINS) expect(contrastRatio(FILLS[bin.key], CARD), bin.key).toBeGreaterThanOrEqual(3);
    // The pale shades are drawn by their edge, which holds 3:1 against the card and against the 0 tint.
    expect(contrastRatio(PALE_EDGE, CARD)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALE_EDGE, FILLS["0"])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(FILLS["0"], FILLS["1"])).toBeGreaterThanOrEqual(3);
    // Darker is more: each bin is darker than the one before it.
    const darkness = BINS.map((bin) => contrastRatio(FILLS[bin.key], CARD));
    expect(darkness).toEqual([...darkness].sort((a, b) => a - b));
    expect(new Set(darkness).size).toBe(BINS.length);
  });

  it("tells 0 from no school in the data by a hatch of 3:1 or more", () => {
    // Both are pale and edged alike; the 0 tint alone is far under 3:1 on white, so the hatch must carry the difference.
    expect(contrastRatio(FILLS["0"], CARD)).toBeLessThan(3);
    expect(contrastRatio(HATCH, CARD)).toBeGreaterThanOrEqual(3);
  });
});

describe("the counts", () => {
  it("shades 0 apart from no school in the data, and each count in its bin", () => {
    expect(shadeOf(null)).toBe("none");
    expect(shadeOf({ schools: 0, top20: 0 })).toBe("none");
    expect(shadeOf({ schools: 3, top20: 0 })).toBe("0");
    // A province whose records all wait to be verified has schools in the data: 0, not none.
    expect(
      shadeMap(PROVINCES, [counted("Manus", 0, 0, 2)]).provinces.find((p) => p.name === "Manus")!.shade
    ).toBe("0");
    const binOf = (top20: number) => shadeOf({ schools: 20, top20 });
    expect([1, 2, 3, 4, 5, 6, 20].map(binOf)).toEqual(["1", "2", "3", "4", "5+", "5+", "5+"]);
    expect(FILLS["0"]).not.toBe(FILLS["1"]);
  });

  it("adds up the spellings of one province, and keeps unknown and blank names aside, never dropped", () => {
    const counts = [
      counted("Hela", 2, 1),
      counted(" hela  ", 1, 1),
      counted("Simbu", 3, 2),
      counted("  ", 1, 0),
      counted(null, 2, 1),
      counted("SIMBU", 0, 0, 1),
    ];
    const view = shadeMap(PROVINCES, counts);
    const hela = view.provinces.find((p) => p.name === "Hela")!;
    expect(hela.tally).toEqual({ schools: 3, top20: 2 });
    expect(hela.shade).toBe("2");
    // Chimbu is the map's name; a school spelt Simbu stays aside, so Chimbu shows as having none in the data.
    expect(view.provinces.find((p) => p.name === "Chimbu")!.shade).toBe("none");
    expect(view.offMap).toEqual([
      { label: "Simbu", tally: { schools: 4, top20: 2 } },
      { label: null, tally: { schools: 3, top20: 1 } },
    ]);
    // Every school of the data is somewhere: on a province of the map or aside.
    const schools = (c: ProvinceCount) =>
      c.inList + c.notYet.missingField + c.notYet.zeroClassrooms + c.notYet.other;
    expect(
      view.provinces.reduce((n, p) => n + (p.tally?.schools ?? 0), 0) +
        view.offMap.reduce((n, o) => n + o.tally.schools, 0)
    ).toBe(counts.reduce((n, c) => n + schools(c), 0));
    expect(provinceNamed(view, "  HELA ")).toBe(hela);
    expect(provinceNamed(view, "Simbu")).toBeNull();
    expect(provinceNamed(view, null)).toBeNull();
    // The table: most first, then by name; a province with none in the data last.
    const rows = tableRows(view);
    expect(rows[0].name).toBe("Hela");
    expect(rows.findIndex((p) => p.tally === null)).toBeGreaterThan(
      rows.findLastIndex((p) => p.tally !== null)
    );
  });

  it("names every province that holds the most", () => {
    const tallies = (entries: [string, number][]) =>
      shadeMap(
        PROVINCES,
        entries.map(([name, top20]) => counted(name, top20 + 1, top20))
      );
    expect(answerOf(tallies([]))).toEqual({ holding: 0, most: 0, leaders: [] });
    expect(
      answerOf(
        tallies([
          ["Jiwaka", 3],
          ["Enga", 1],
          ["Hela", 3],
        ])
      )
    ).toEqual({ holding: 3, most: 3, leaders: ["Hela", "Jiwaka"] });
  });
});

/** The boundary file's rings for each province, as numbers: every path is straight segments in absolute units. */
const RINGS = new Map(
  [...BOUNDARIES.matchAll(/data-name="([^"]+)" d="([^"]+)"/g)].map(([, name, d]) => [
    name,
    [...d.matchAll(/M([^MZ]+)Z?/g)].map(([, ring]) =>
      [...ring.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)] as const)
    ),
  ])
);
/** Whether a point is inside a province, by the even-odd rule its path is drawn with. */
function holds(name: string, [x, y]: readonly [number, number]): boolean {
  let inside = false;
  for (const ring of RINGS.get(name)!)
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
    }
  return inside;
}

describe("the map's names", () => {
  it("places every province's name and number inside it, and no two numbers within 42 units", () => {
    expect(Object.keys(LABELS).sort()).toEqual([...PROVINCES].sort());
    for (const [name, label] of Object.entries(LABELS))
      for (const point of [label.at, label.mark ?? label.at])
        expect(
          PROVINCES.filter((p) => holds(p, point)),
          `${name} at ${point}`
        ).toEqual([name]);
    // A phone's 14 px numbers stay apart on the narrowest map, about 0.37 px a unit.
    const marks = Object.entries(LABELS).map(([name, label]) => [name, label.mark ?? label.at] as const);
    for (const [i, [a, p]] of marks.entries())
      for (const [b, q] of marks.slice(i + 1))
        expect(Math.hypot(p[0] - q[0], p[1] - q[1]), `${a} / ${b}`).toBeGreaterThanOrEqual(42);
  });

  it("numbers the provinces with schools in the top 20, most first and then by name", () => {
    const view = shadeMap(PROVINCES, [
      counted("Hela", 9, 6),
      counted("Enga", 5, 3),
      counted("Jiwaka", 4, 3),
      counted("Manus", 2, 0),
    ]);
    expect(namedProvinces(view).map(({ province, number }) => [number, province.name])).toEqual([
      [1, "Hela"],
      [2, "Enga"],
      [3, "Jiwaka"],
    ]);
  });
});
