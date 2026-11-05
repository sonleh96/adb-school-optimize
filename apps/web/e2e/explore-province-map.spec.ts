/**
 * The explore page's province map (components/explore/sections/ProvinceMap.tsx), mostly on the "province-map" dataset:
 * invented schools in 11 of the 22 real provinces. Failure modes, each with the test that catches it:
 *  1. A province is drawn in another province's shape
 *                         -> "draws every province where it is: a town in each falls inside its own shape only"
 *  2. 0 is drawn as no school in the data, or the reverse; a shade does not match its legend bin; the table says
 *     another count or shade than the map
 *                         -> "shades each province by its count of the top 20, as its legend and its table say"
 *  3. The marked school's province is not outlined, another one is, or the words and the table do not say which
 *                         -> "outlines the marked school's province, whatever its shade, ..."
 *  4. A school whose province the map does not have is dropped, or drawn on a wrong shape; or the marked school's
 *     row among them is not tagged as marked
 *                         -> "keeps schools whose province is not on the map in words and in the table"
 *  5. On a 360 px phone the map is too small to read, the page scrolls sideways, or a key leaves the card
 *                         -> "fits a 360 px phone with the map as wide as its card"
 *  6. Two neighbouring provinces merge, or a pale province fades into the card
 *                         -> "separates neighbours by the card's white and draws each pale province by its edge"
 *  7. The outlines ride in the page's script, or a file that does not arrive leaves the reader with nothing
 *                         -> "reads the outlines as a static file, and keeps every count when it does not arrive"
 *  8. A first-time reader cannot tell which shape is which: a province with schools in the top 20 has no name on or
 *     beside the map, a name points at another province, two names cover each other, or on a phone the names are
 *     unreadable or shown only on hover
 *                         -> "names each province with schools in the top 20 ..." and
 *                            "keeps every name apart when the top 20 spread over 20 provinces, at ..."
 * Each expected count and shade is worked out here from the fixture's own rows and the legend's stated breaks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { contrastRatio } from "../lib/screening/contrast";
import { EXPLORE } from "../lib/screening/copy/explore";
import { EXPLORE_MAP } from "../lib/screening/copy/explore-province-map";

import { type MockDataset, expect, test, useMockDataset } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const BOUNDARIES = readFileSync(path.resolve(__dirname, "../public/images/png-provinces.svg"), "utf8");

interface Row {
  cohort: string;
  school: { school_key: string; source_school_name: string; province: string | null };
  point_rank: { rank: number | null };
  rank_bounds: { best: number | null };
}
const rowsOf = (dataset: MockDataset): Row[] =>
  JSON.parse(
    readFileSync(
      path.join(FIXTURES, dataset === "default" ? "" : dataset, "results/additive_no_u.json"),
      "utf8"
    )
  ).rows;

/** Each province the rows name: its schools, and those of them ranked 1 to 20 with every input recorded. */
function talliesOf(rows: Row[]) {
  const tallies = new Map<string, { schools: number; top20: number }>();
  for (const row of rows) {
    const name = row.school.province ?? "";
    const was = tallies.get(name) ?? { schools: 0, top20: 0 };
    const top = row.cohort === "complete" && row.point_rank.rank !== null && row.point_rank.rank <= 20;
    tallies.set(name, { schools: was.schools + 1, top20: was.top20 + (top ? 1 : 0) });
  }
  return tallies;
}

/** A town, or an inland point, in each province, as longitude and latitude. */
const TOWNS: Record<string, [string, number, number]> = {
  Bougainville: ["Arawa", 155.57, -6.23],
  Central: ["Bereina", 146.51, -8.64],
  Chimbu: ["Kundiawa", 144.97, -6.02],
  "East New Britain": ["Kokopo", 152.26, -4.35],
  "East Sepik": ["Maprik", 143.05, -3.63],
  "Eastern Highlands": ["Goroka", 145.39, -6.08],
  Enga: ["Wabag", 143.71, -5.48],
  Gulf: ["Kaintiba", 146.03, -7.5],
  Hela: ["Tari", 142.95, -5.85],
  Jiwaka: ["Banz", 144.62, -5.8],
  Madang: ["Madang", 145.79, -5.22],
  Manus: ["inland Manus Island", 146.95, -2.08],
  "Milne Bay": ["Rabaraba", 149.83, -9.97],
  Morobe: ["Wau", 146.72, -7.34],
  "National Capital District": ["Port Moresby", 147.18, -9.44],
  "New Ireland": ["Kavieng", 150.8, -2.57],
  Northern: ["Popondetta", 148.24, -8.77],
  Sandaun: ["Telefomin", 141.64, -5.13],
  "Southern Highlands": ["Mendi", 143.66, -6.15],
  "West New Britain": ["inland, south-east of Kimbe", 150.5, -5.65],
  Western: ["Kiunga", 141.3, -6.12],
  "Western Highlands": ["Mount Hagen", 144.23, -5.86],
};

const section = (page: Page) => page.locator("[data-region=province-map]");
const pathOf = (page: Page, name: string) => section(page).locator(`path[data-province="${name}"]`);

async function openMap(page: Page, search = "") {
  await page.goto(`/explore${search}`);
  await expect(section(page).locator("path[data-province]")).toHaveCount(22, { timeout: 30_000 });
}

/** The legend's keys: each label and its swatch's colour, as the page draws them. */
async function legendOf(page: Page) {
  return section(page)
    .locator("[data-region=province-map-legend] li[data-shade]")
    .evaluateAll((items) =>
      items.map((li) => ({
        shade: li.getAttribute("data-shade")!,
        label: li.textContent!.trim(),
        colour: getComputedStyle(li.querySelector("span")!).backgroundColor,
        image: getComputedStyle(li.querySelector("span")!).backgroundImage,
      }))
    );
}

/** The table's rows, opened from the section's own button. */
async function tableOf(page: Page) {
  const button = section(page).getByRole("button", { name: EXPLORE.table.show });
  if (await button.isVisible()) await button.click();
  const rows = section(page).locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((trs) =>
    trs.map((tr) => ({
      name: tr.querySelector("th")!.childNodes[0].textContent!.trim(),
      tag: tr.querySelector("th span")?.textContent ?? null,
      count: tr.querySelector("td")!.textContent!.trim(),
      shade: tr.getAttribute("data-shade"),
      marked: tr.hasAttribute("data-marked"),
    }))
  );
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const hexOf = (colour: string) =>
  `#${colour
    .match(/\d+/g)!
    .slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, "0"))
    .join("")}`;

test("draws every province where it is: a town in each falls inside its own shape only", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  await openMap(page);
  // The boundary file's own projection, so a town lands where the file draws it.
  const read = (name: string) => Number(BOUNDARIES.match(new RegExp(`data-${name}="([^"]+)"`))![1]);
  const [west, north, kx, scale] = ["west", "north", "kx", "scale"].map(read);
  const points = Object.entries(TOWNS).map(([province, [town, lon, lat]]) => ({
    province,
    town,
    x: (lon - west) * kx * scale,
    y: (north - lat) * scale,
  }));
  const found = await section(page).evaluate((root, towns) => {
    const paths = [...root.querySelectorAll<SVGPathElement>("path[data-province]")];
    return towns.map((t) => ({
      ...t,
      inside: paths
        .filter((p) => p.isPointInFill(new DOMPoint(t.x, t.y)))
        .map((p) => p.getAttribute("data-province")),
    }));
  }, points);
  for (const town of found) expect(town.inside, `${town.town}, ${town.province}`).toEqual([town.province]);
});

test("shades each province by its count of the top 20, as its legend and its table say", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  await openMap(page);
  const tallies = talliesOf(rowsOf("province-map"));
  const legend = await legendOf(page);
  // The stated breaks: each bin is a count, and the last holds that count and more.
  const bins = legend
    .filter((key) => /^\d/.test(key.label))
    .map((key) => ({
      ...key,
      least: Number(key.label.match(/^\d+/)![0]),
      open: / or more$/.test(key.label),
    }));
  expect(bins.map((b) => b.label)).toEqual(["0", "1", "2", "3", "4", "5 or more"]);
  const binFor = (count: number) =>
    bins.find((b) => b.least === count || (b.open && count >= b.least)) ?? null;
  const none = legend.find((key) => key.label === EXPLORE_MAP.legend.shades.none)!;
  expect(none.image).toMatch(/repeating-linear-gradient/);

  const table = await tableOf(page);
  expect(table).toHaveLength(22);
  let shaded = 0;
  for (const row of table) {
    const tally = tallies.get(row.name);
    const drawn = pathOf(page, row.name);
    const fill = (await drawn.getAttribute("fill"))!;
    if (!tally) {
      // No school of the data names it: hatched, and said in words, never as 0.
      expect(fill, row.name).toMatch(/^url\(#/);
      expect(row.count, row.name).toBe(EXPLORE_MAP.table.none);
      expect(await drawn.getAttribute("data-shade"), row.name).toBe(none.shade);
    } else {
      const bin = binFor(tally.top20)!;
      expect(bin, row.name).not.toBeNull();
      expect(rgb(fill), row.name).toBe(bin.colour);
      expect(row.count, row.name).toBe(String(tally.top20));
      expect(await drawn.getAttribute("data-shade"), row.name).toBe(bin.shade);
      shaded += 1;
    }
    expect(row.shade, row.name).toBe(await drawn.getAttribute("data-shade"));
  }
  expect(shaded).toBe(tallies.size);
  // The dataset holds every bin, 0 among them, and provinces with no school at all.
  const used = new Set(table.map((r) => r.shade));
  for (const key of legend) expect(used, key.label).toContain(key.shade);
  // 0 and none are told apart by fill as well as by words.
  expect(rgb((await pathOf(page, "Morobe").getAttribute("fill"))!)).not.toBe("rgb(255, 255, 255)");

  // The answer: the provinces with a school of the top 20, and the one with the most.
  const holding = [...tallies].filter(([, t]) => t.top20 > 0);
  const most = Math.max(...holding.map(([, t]) => t.top20));
  const leaders = holding.filter(([, t]) => t.top20 === most).map(([name]) => name);
  await expect(section(page).locator("[data-region=province-map-answer]")).toHaveText(
    EXPLORE_MAP.answer(holding.length, 22, leaders, most)
  );
  const ranges = rowsOf("province-map").filter((r) => r.cohort === "interval" && r.rank_bounds.best! <= 20);
  await expect(section(page).locator("[data-region=province-map-ranges]")).toHaveText(
    EXPLORE_MAP.ranges(ranges.length)
  );
  await expect(section(page).getByText(EXPLORE_MAP.location)).toBeVisible();
  await expect(section(page).getByRole("link", { name: EXPLORE_MAP.credit.text })).toHaveAttribute(
    "href",
    EXPLORE_MAP.credit.href
  );
});

test("outlines the marked school's province, whatever its shade, and says which in words and in the table", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  const tallies = talliesOf(rowsOf("province-map"));
  const listed = rowsOf("province-map").filter((r) => r.cohort !== "verification_queue");
  // The darkest bin, a province with none in the top 20, and a school that shows a range.
  const picks = ["Map Sample 23", "Map Sample 01", "Map Range One"].map(
    (name) => listed.find((r) => r.school.source_school_name === name)!.school
  );
  await openMap(page, `?school=${picks[0].school_key}`);
  for (const [i, school] of picks.entries()) {
    if (i > 0) await page.getByLabel(EXPLORE.pick.label).selectOption(school.school_key);
    const province = school.province!;
    const ring = section(page).locator("[data-marked-province]");
    await expect(ring, school.source_school_name).toHaveAttribute("data-marked-province", province);
    const d = await pathOf(page, province).getAttribute("d");
    for (const line of await ring.locator("path").all()) await expect(line).toHaveAttribute("d", d!);
    await expect(section(page).locator("[data-region=province-map-marked]")).toHaveText(
      EXPLORE_MAP.marked(school.source_school_name, province, tallies.get(province)!.top20)
    );
    await expect(section(page).locator("[data-key=marked]")).toHaveText(EXPLORE_MAP.legend.marked);
    const marked = (await tableOf(page)).filter((r) => r.marked);
    expect(marked.map((r) => [r.name, r.tag])).toEqual([[province, EXPLORE.table.marked]]);
  }
  await page.getByLabel(EXPLORE.pick.label).selectOption("");
  await expect(section(page).locator("[data-marked-province]")).toHaveCount(0);
  await expect(section(page).locator("[data-region=province-map-marked]")).toHaveCount(0);
});

test("keeps schools whose province is not on the map in words and in the table", async ({ page }) => {
  // The default dataset's provinces are invented, so none of its schools is in a province the map has.
  const rows = rowsOf("default");
  const tallies = talliesOf(rows);
  const top20 = [...tallies.values()].reduce((n, t) => n + t.top20, 0);
  const school = rows.find((r) => r.cohort === "complete")!.school;
  await openMap(page, `?school=${school.school_key}`);
  const shades = await section(page)
    .locator("path[data-province]")
    .evaluateAll((paths) => paths.map((p) => p.getAttribute("data-shade")));
  expect(new Set(shades)).toEqual(new Set(["none"]));
  await expect(section(page).locator("[data-region=province-map-answer]")).toHaveText(
    EXPLORE_MAP.answer(0, 22, [], 0)
  );
  await expect(section(page).locator("[data-region=province-map-off-map]")).toHaveText(
    EXPLORE_MAP.offMap(rows.length, top20)
  );
  await expect(section(page).locator("[data-marked-province]")).toHaveCount(0);
  await expect(section(page).locator("[data-region=province-map-marked]")).toHaveText(
    EXPLORE_MAP.markedOff(school.source_school_name)
  );
  const table = await tableOf(page);
  const off = table.filter((r) => r.tag === EXPLORE_MAP.table.offMap);
  expect(off.map((r) => [r.name, Number(r.count)]).sort()).toEqual(
    [...tallies].map(([name, t]) => [name, t.top20]).sort()
  );
  // They come after the 22 provinces of the map.
  expect(table.slice(22)).toEqual(off);
  // The marked school's own row is tagged, as a province on the map would be, and no other row is.
  expect(off.filter((r) => r.marked).map((r) => r.name)).toEqual([school.province]);
  await expect(section(page).locator("table tbody tr[data-marked] th")).toContainText(EXPLORE.table.marked);
});

test("fits a 360 px phone with the map as wide as its card", async ({ page, context }) => {
  await useMockDataset(context, "province-map");
  await page.setViewportSize({ width: 360, height: 740 });
  const enga = rowsOf("province-map").find((r) => r.school.province === "Enga")!.school;
  await openMap(page, `?school=${enga.school_key}`);
  await tableOf(page);
  const sideways = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(sideways).toBeLessThanOrEqual(0);
  const card = (await section(page).locator("figure").boundingBox())!;
  const svg = (await section(page).locator("svg").boundingBox())!;
  // The map takes the card's full width but for a few pixels of its edge, and keeps the boundary file's shape.
  expect(svg.width).toBeGreaterThanOrEqual(card.width - 16);
  expect(svg.x).toBeGreaterThanOrEqual(card.x);
  expect(svg.x + svg.width).toBeLessThanOrEqual(card.x + card.width);
  // A highlands province, among the smallest with a school of the top 20, still makes a clear mark once outlined.
  const ring = (await section(page).locator("[data-marked-province] path").first().boundingBox())!;
  expect(Math.min(ring.width, ring.height)).toBeGreaterThanOrEqual(12);
  const inside = async (items: Locator) => {
    for (const box of await items.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, right: r.right };
      })
    )) {
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.right).toBeLessThanOrEqual(card.x + card.width + 0.5);
    }
  };
  await inside(section(page).locator("[data-region=province-map-legend] li"));
  await inside(section(page).locator("figure > p, figure table"));
});

test("separates neighbours by the card's white and draws each pale province by its edge", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  await openMap(page);
  const card = await section(page)
    .locator("figure")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const drawn = await section(page)
    .locator("path[data-province]")
    .evaluateAll((paths) =>
      paths.map((p) => {
        const style = getComputedStyle(p);
        return {
          name: p.getAttribute("data-province")!,
          shade: p.getAttribute("data-shade")!,
          fill: p.getAttribute("fill")!,
          stroke: style.stroke,
          width: style.strokeWidth,
          scaling: style.vectorEffect,
        };
      })
    );
  for (const province of drawn) {
    // The gap between two provinces is the card's own white, a pixel wide at any size of the map.
    expect(province.stroke, province.name).toBe(card);
    expect([province.width, province.scaling], province.name).toEqual(["1px", "non-scaling-stroke"]);
    if (province.fill.startsWith("#") && province.shade !== "0")
      expect(contrastRatio(province.fill, hexOf(card)), province.name).toBeGreaterThanOrEqual(3);
  }
  // Each pale province, 0 or none, has an edge of its own drawn over its borders, at 3:1 on the card.
  const pale = drawn.filter((p) => p.shade === "0" || p.shade === "none");
  const edges = await section(page)
    .locator("svg > g:nth-of-type(2) path")
    .evaluateAll((paths) =>
      paths.map((p) => ({ d: p.getAttribute("d"), stroke: getComputedStyle(p).stroke }))
    );
  expect(edges).toHaveLength(pale.length);
  for (const edge of edges) expect(contrastRatio(hexOf(edge.stroke), hexOf(card))).toBeGreaterThanOrEqual(3);
  const paleOutlines = await Promise.all(pale.map((p) => pathOf(page, p.name).getAttribute("d")));
  expect(edges.map((e) => e.d).sort()).toEqual(paleOutlines.sort());
});

test("reads the outlines as a static file, and keeps every count when it does not arrive", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  const scripts: string[] = [];
  const outlines: string[] = [];
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (type.includes("javascript")) scripts.push(await response.text().catch(() => ""));
    if (type.includes("image/svg+xml") && response.url().includes("png-provinces"))
      outlines.push(response.url());
  });
  await openMap(page);
  expect(outlines).toHaveLength(1);
  // The first province's outline as the file writes it: no script the page loads carries it.
  const marker = BOUNDARIES.match(/ d="(M[^L]+L[^L]+L[^L]+)/)![1];
  expect(scripts.length).toBeGreaterThan(3);
  expect(scripts.filter((s) => s.includes(marker))).toEqual([]);

  // When the file does not arrive, the drawing says so, and the words and the table keep every count. The missing
  // file is provoked on a page of its own, so the test's own page stays free of errors.
  const fresh = await context.newPage();
  await fresh.route("**/*png-provinces*.svg", (route) => route.fulfill({ status: 404, body: "" }));
  await fresh.goto("/explore");
  await expect(fresh.locator("[data-region=province-map]").getByRole("status")).toHaveText(
    EXPLORE_MAP.failed,
    {
      timeout: 30_000,
    }
  );
  await expect(fresh.locator("[data-region=province-map] path")).toHaveCount(0);
  await expect(fresh.locator("[data-region=province-map-answer]")).not.toBeEmpty();
  await fresh.locator("[data-region=province-map]").getByRole("button", { name: EXPLORE.table.show }).click();
  await expect(fresh.locator("[data-region=province-map-table] tbody tr")).toHaveCount(22);
  await fresh.close();
});

/** The provinces that hold the top 20 when it is spread one school each over the 20 hardest to name: every one but the
 * two widest, so the crowded highlands, the islands and the National Capital District all need their names at once. */
const SPREAD = Object.keys(TOWNS).filter((p) => p !== "Western" && p !== "Sandaun");

/** Serves the province-map dataset's main list with its top 20 moved one each into the `SPREAD` provinces. */
async function spreadTop20(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/screening/results") && url.searchParams.get("rule") === "additive_no_u",
    async (route) => {
      const body = await (await route.fetch()).json();
      let next = 0;
      for (const row of body.rows)
        if (row.cohort === "complete" && row.point_rank.rank <= 20) row.school.province = SPREAD[next++];
      return route.fulfill({ json: body });
    }
  );
}

/** What names the map's provinces: each visible name or number, its box, and the province whose fill holds a point. */
async function namesOf(page: Page, region: "province-map-names" | "province-map-numbers") {
  return section(page).evaluate((root, which) => {
    const svg = root.querySelector<SVGSVGElement>("svg")!;
    const paths = [...root.querySelectorAll<SVGPathElement>("path[data-province]")];
    const toMap = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
    const holder = (p: DOMPoint) =>
      paths.filter((path) => path.isPointInFill(p)).map((path) => path.getAttribute("data-province"));
    return [...root.querySelectorAll<HTMLElement>(`[data-region="${which}"] [data-province]`)]
      .filter((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const box = el.getBoundingClientRect();
        const province = el.getAttribute("data-province")!;
        const leader = root.querySelector(`line[data-leader="${province}"]`);
        // A name on its shape is held by its centre; a name beside it, by the far end of its line.
        const point = leader
          ? new DOMPoint(Number(leader.getAttribute("x1")), Number(leader.getAttribute("y1")))
          : toMap(box.x + box.width / 2, box.y + box.height / 2);
        return {
          province,
          text: el.textContent!.replace(/\s+/g, " ").trim(),
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          heldBy: holder(point),
        };
      });
  }, region);
}

type Named = Awaited<ReturnType<typeof namesOf>>[number];
/** Two names cover each other when their boxes meet; two round numbers, when their circles do. */
const overlaps = (a: Named["box"], b: Named["box"], round: boolean) =>
  round
    ? Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) <
      (a.width + b.width) / 2
    : a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function expectApartAndInside(
  named: Named[],
  card: { x: number; y: number; width: number; height: number },
  round = false
) {
  for (const [i, a] of named.entries()) {
    expect(a.heldBy, a.province).toEqual([a.province]);
    expect(a.box.x, a.province).toBeGreaterThanOrEqual(card.x);
    expect(a.box.x + a.box.width, a.province).toBeLessThanOrEqual(card.x + card.width);
    for (const b of named.slice(i + 1))
      expect(overlaps(a.box, b.box, round), `${a.province} / ${b.province}`).toBe(false);
  }
}

test("names each province with schools in the top 20 on a wide map, and numbers them on a phone with a key", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "province-map");
  const tallies = talliesOf(rowsOf("province-map"));
  const holding = [...tallies]
    .filter(([name, t]) => name in TOWNS && t.top20 > 0)
    .sort(([a, x], [b, y]) => y.top20 - x.top20 || a.localeCompare(b, "en"));
  expect(holding.length).toBeGreaterThan(3);

  await page.setViewportSize({ width: 1440, height: 900 });
  await openMap(page);
  const names = await namesOf(page, "province-map-names");
  expect(names.map((n) => n.province).sort()).toEqual(holding.map(([name]) => name).sort());
  for (const n of names) expect(n.text, n.province).toBe(`${n.province} ${tallies.get(n.province)!.top20}`);
  expectApartAndInside(names, (await section(page).locator("figure").boundingBox())!);
  await expect(
    section(page).locator("[data-region=province-map-numbers] [data-province]").first()
  ).toBeHidden();

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    const numbers = await namesOf(page, "province-map-numbers");
    expect(numbers.map((n) => n.text)).toEqual(holding.map((_, i) => String(i + 1)));
    expect(numbers.map((n) => n.province)).toEqual(holding.map(([name]) => name));
    expectApartAndInside(numbers, (await section(page).locator("figure").boundingBox())!, true);
    await expect(
      section(page).locator("[data-region=province-map-names] [data-province]").first()
    ).toBeHidden();
    // The key under the map names each number, in the same order, with its count: nothing needs a hover.
    const key = section(page).locator("[data-region=province-map-key]");
    await expect(key).toBeVisible();
    await expect(key.locator("li")).toHaveText(holding.map(([name, t], i) => `${i + 1}${name} ${t.top20}`));
  }
});

for (const width of [1024, 922, 390, 360])
  test(`keeps every name apart when the top 20 spread over 20 provinces, at ${width} px`, async ({
    page,
    context,
  }) => {
    await useMockDataset(context, "province-map");
    await spreadTop20(page);
    await page.setViewportSize({ width, height: 900 });
    await openMap(page);
    const numbered = width < 600;
    const named = await namesOf(page, numbered ? "province-map-numbers" : "province-map-names");
    expect(named.map((n) => n.province).sort()).toEqual([...SPREAD].sort());
    expectApartAndInside(named, (await section(page).locator("figure").boundingBox())!, numbered);
  });
