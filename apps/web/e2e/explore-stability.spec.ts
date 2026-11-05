/**
 * The explore page's second question, how stable the list is (/explore, set 2), and the page's question index.
 * Failure modes, each with the test that catches it:
 *  1. A dot sits on the wrong side of the line, or inside the shaded band when its share is outside it, or the
 *     reverse, at the edges the saved tests hold (exactly 80%, 79.99%, 80.14%, 81.05%)
 *                                        -> "puts every dot on the side of the line and the band its share is on"
 *  2. A rule the test did not run for is offered or drawn with frequencies, or one rule's frequencies are drawn
 *     under the other                    -> "offers only the two tested rules ..."
 *  3. A school a rule holds for verification is drawn at a rank under that rule, or joined to it by a line
 *                                        -> "draws a school not in a rule's list in the row below, never at a rank"
 *  4. A range of possible ranks is drawn as one rank, or joined to by a line, including one whose ends meet; or a
 *     range, marked or not, looks like the open ring of a school outside a list
 *                                        -> "draws a range as a bar spanning its ranks ..."
 *  5. The switch or the picker does not update the charts, the answer or the address
 *                                        -> "the switch and the picker update both charts ..."
 *  6. On a 390 or 360 px phone the page scrolls sideways, or a mark or a column name leaves its card or covers another
 *                                        -> "fits a ... phone with a school marked and both tables open"
 *  7. A table says something its chart does not draw
 *                                        -> "each table says what its chart draws"
 *  8. The page's first load reads another rule's list on any screen before set 2 is on it (on a desktop, set 2's
 *     look-ahead fired at once), or the earlier method's list is read twice, once for this section and once for the
 *     drivers' switch                    -> "reads only the main list on a first load at ... px ..."
 *  9. A failed read of another rule's list breaks the page, or Retry does not ask for it again
 *                                        -> "says in the chart when another rule's list fails, and recovers on Retry"
 * 10. A column's range under the dot plot is missing or wrong, sits under another column, or names a range its dots
 *     are not in; or nothing on the page says the columns are ranges drawn the same width
 *                                        -> "names each column's range under it ..."
 * 11. The earlier method's test is offered but cannot be pressed, with no reason, while its list loads or after it
 *     fails; or the dot plot has no Retry   -> "says in the dot plot why the earlier method's test cannot be shown ..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { EXPLORE } from "../lib/screening/copy/explore";
import { DRIVERS } from "../lib/screening/copy/explore-drivers";
import { EXPLORE_STABILITY } from "../lib/screening/copy/explore-stability";
import { LAYOUT } from "../lib/screening/copy/words";

import { type MockDataset, expect, test } from "./screening-helpers";

test.describe.configure({ timeout: 90_000 });

const MAIN = "additive_no_u";
const URGENCY = "additive_u";
const RULES = [
  MAIN,
  URGENCY,
  "need_first_no_u",
  "need_first_u",
  "bottleneck_no_u",
  "bottleneck_u",
  "benchmark",
] as const;
const TOP = 20;
const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const W = EXPLORE_STABILITY;

/** The saved responses, read without the code under test. */
interface SavedRow {
  cohort: "complete" | "interval" | "verification_queue";
  school: { school_key: string; source_school_name: string };
  point_rank: { rank: number | null; scope_code: string };
  rank_bounds: { best: number | null; worst: number | null; scope_code: string };
  persistent_candidate?: boolean | null;
  top20_frequencies?: { setting_id: string; frequency: number }[] | null;
}
interface SavedList {
  rows: SavedRow[];
  persistence: { threshold: number; standard_error: number; adjacency_standard_errors?: number } | null;
}
const saved = (rule: string, dataset: MockDataset = "default"): SavedList =>
  JSON.parse(
    readFileSync(path.join(FIXTURES, dataset === "default" ? "" : dataset, `results/${rule}.json`), "utf8")
  );
/** The main method's top 20 as its own list ranks them: one rank among its complete schools, 20 or better. */
const topRows = () =>
  saved(MAIN)
    .rows.filter((r) => r.cohort === "complete" && r.point_rank.rank! <= TOP)
    .sort((a, b) => a.point_rank.rank! - b.point_rank.rank!);

/** A request for one rule's list. */
const listOf = (rule: string) => (url: URL) =>
  url.pathname.endsWith("/api/v1/screening/results") && url.searchParams.get("rule") === rule;

const section = (page: Page) => page.locator("[data-region=stability]");
const frequencies = (page: Page) => page.locator("figure[data-chart=frequencies]");
const bump = (page: Page) => page.locator("figure[data-chart=bump]");

/** Opens the page and brings set 2 to the screen, which reads the other rules' lists, then waits for both charts. */
async function openExplore(page: Page, search = "") {
  await page.goto(`/explore${search}`);
  await expect(section(page)).toBeAttached({ timeout: 45_000 });
  await section(page).scrollIntoViewIfNeeded();
  await expect(bump(page).locator("svg circle").first()).toBeVisible({ timeout: 45_000 });
  await expect(frequencies(page).locator("svg circle").first()).toBeVisible();
}

/** Each row of the dot plot: its dots, its line and its band, as drawn. */
async function rowsDrawn(figure: Locator) {
  return figure.locator("[data-setting]").evaluateAll((rows) =>
    rows.map((row) => {
      const num = (el: Element | null, name: string) => Number(el?.getAttribute(name));
      const line = row.querySelector("[data-part=line]");
      const band = row.querySelector("[data-part=band]");
      return {
        setting: Number(row.getAttribute("data-setting")),
        line: num(line, "x1"),
        band: band ? { lo: num(band, "x"), hi: num(band, "x") + num(band, "width") } : null,
        dots: [...row.querySelectorAll("circle")].map((c) => ({
          key: c.getAttribute("data-school-key")!,
          column: num(c, "data-column"),
          marked: c.hasAttribute("data-marked"),
          left: num(c, "cx") - num(c, "r"),
          right: num(c, "cx") + num(c, "r"),
        })),
      };
    })
  );
}

/** Every mark the chart of ranks draws: points, bars, rings and the pieces of each line. */
async function bumpDrawn(figure: Locator) {
  return figure.locator("svg").evaluate((svg) => {
    const num = (el: Element, name: string) => Number(el.getAttribute(name));
    const keyOf = (el: Element) => el.closest("[data-school-key]")!.getAttribute("data-school-key")!;
    const breakLine = svg.querySelector("[data-part=break]");
    return {
      breakY: breakLine ? num(breakLine, "y1") : null,
      points: [...svg.querySelectorAll("circle[data-rank]")].map((c) => ({
        key: keyOf(c),
        rule: c.getAttribute("data-rule")!,
        rank: num(c, "data-rank"),
        y: num(c, "cy"),
        x: num(c, "cx"),
      })),
      bars: [...svg.querySelectorAll("rect[data-best]")].map((r) => ({
        key: keyOf(r),
        rule: r.getAttribute("data-rule")!,
        best: num(r, "data-best"),
        worst: num(r, "data-worst"),
        top: num(r, "y"),
        bottom: num(r, "y") + num(r, "height"),
        width: num(r, "width"),
      })),
      rings: [...svg.querySelectorAll("circle[data-out]")].map((c) => ({
        key: keyOf(c),
        rule: c.getAttribute("data-rule")!,
        y: num(c, "cy"),
      })),
      lines: [...svg.querySelectorAll("line[data-from]")].map((l) => ({
        key: keyOf(l),
        from: l.getAttribute("data-from")!,
        to: l.getAttribute("data-to")!,
      })),
      marked: [...svg.querySelectorAll("g[data-marked]")].map((g) => g.getAttribute("data-school-key")),
    };
  });
}

async function openTable(figure: Locator) {
  const button = figure.getByRole("button", { name: EXPLORE.table.show });
  if (await button.isVisible()) await button.click();
  await expect(figure.locator("table tbody tr").first()).toBeVisible();
}

test("puts every dot on the side of the line and the band its share is on", async ({ page }) => {
  await openExplore(page);
  for (const rule of [MAIN, URGENCY]) {
    await frequencies(page).locator(`[data-region=frequency-switch] button[data-rule=${rule}]`).click();
    await expect(frequencies(page)).toHaveAttribute("data-rule", rule);
    const list = saved(rule);
    const { threshold, standard_error: se, adjacency_standard_errors: k = 1 } = list.persistence!;
    const [lo, hi] = [threshold - se * k, threshold + se * k];
    const shares = new Map(
      list.rows
        .filter((r) => r.cohort !== "verification_queue" && r.top20_frequencies)
        .map((r) => [r.school.school_key, r.top20_frequencies!.map((f) => f.frequency)])
    );
    const rows = await rowsDrawn(frequencies(page));
    expect(rows).toHaveLength(3);
    let near = 0;
    for (const row of rows) {
      expect(row.band, `${rule} ${row.setting}`).not.toBeNull();
      // One dot per school with shares in this test, and no other.
      expect(row.dots.map((d) => d.key).sort(), `${rule} ${row.setting}`).toEqual([...shares.keys()].sort());
      for (const dot of row.dots) {
        const f = shares.get(dot.key)![row.setting];
        const label = `${rule} setting ${row.setting} ${dot.key} at ${f}`;
        if (f >= threshold) expect(dot.left, label).toBeGreaterThanOrEqual(row.line - 0.5);
        else expect(dot.right, label).toBeLessThanOrEqual(row.line + 0.5);
        const band = row.band!;
        if (f >= lo && f <= hi) {
          near += 1;
          expect(dot.left, label).toBeGreaterThanOrEqual(band.lo - 0.5);
          expect(dot.right, label).toBeLessThanOrEqual(band.hi + 0.5);
        } else expect(dot.right <= band.lo + 0.5 || dot.left >= band.hi - 0.5, label).toBe(true);
      }
    }
    // The saved tests put shares inside each band, so the band's edges are tested, not assumed.
    expect(near, rule).toBeGreaterThan(0);
  }
});

test("offers only the two tested rules, and draws each from its own list", async ({ page }) => {
  // A list of another rule that carries frequencies and a test, as a broken API might send, is still not drawn.
  await page.route(listOf("need_first_no_u"), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.persistence = saved(MAIN).persistence;
    for (const row of body.rows) {
      row.persistent_candidate = false;
      row.top20_frequencies = [{ setting_id: "concentration_20_15", frequency: 0.5 }];
    }
    await route.fulfill({ response, json: body });
  });
  await openExplore(page);
  const buttons = frequencies(page).locator("[data-region=frequency-switch] button");
  await expect(buttons).toHaveCount(2);
  expect(await buttons.evaluateAll((bs) => bs.map((b) => b.getAttribute("data-rule")))).toEqual([
    MAIN,
    URGENCY,
  ]);

  // A school whose share differs between the two tests is drawn where each rule's own test puts it.
  const urgencyRows = saved(URGENCY).rows;
  const split = urgencyRows.find((r) => r.top20_frequencies?.some((f) => f.frequency === 0.7999))!;
  const key = split.school.school_key;
  const setting = split.top20_frequencies!.findIndex((f) => f.frequency === 0.7999);
  const mainShare = saved(MAIN).rows.find((r) => r.school.school_key === key)!.top20_frequencies![setting]
    .frequency;
  expect(mainShare).toBeGreaterThanOrEqual(0.8);
  const sideOf = async () => {
    const row = (await rowsDrawn(frequencies(page)))[setting];
    const dot = row.dots.find((d) => d.key === key)!;
    return dot.left >= row.line - 0.5 ? "at or above" : "below";
  };
  expect(await sideOf()).toBe("at or above");
  await buttons.nth(1).click();
  expect(await sideOf()).toBe("below");

  // Without the earlier method's test in its list, only the main method's is offered, and named as its own.
  await page.unroute(listOf("need_first_no_u"));
  await page.route(listOf(URGENCY), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.persistence = null;
    await route.fulfill({ response, json: body });
  });
  await openExplore(page);
  await expect(frequencies(page).locator("[data-region=frequency-switch]")).toHaveCount(0);
  await expect(frequencies(page)).toHaveAttribute("data-rule", MAIN);
  await expect(frequencies(page).locator("[data-region=frequency-answer]")).toHaveText(
    /^In the main method's own test, /
  );
});

test("draws a school not in a rule's list in the row below, never at a rank", async ({ page }) => {
  await openExplore(page);
  const drawn = await bumpDrawn(bump(page));
  const top = topRows();
  // The fixtures hold a top-20 school that is a record to verify under some rules.
  const outs = top.flatMap((row) =>
    RULES.filter(
      (rule) =>
        saved(rule).rows.find((r) => r.school.school_key === row.school.school_key)?.cohort ===
        "verification_queue"
    ).map((rule) => ({ key: row.school.school_key, rule }))
  );
  expect(outs.length).toBeGreaterThan(0);
  const lowest = Math.max(...drawn.points.map((p) => p.y), ...drawn.bars.map((b) => b.bottom));
  for (const { key, rule } of outs) {
    expect(
      drawn.points.filter((p) => p.key === key && p.rule === rule),
      `${key} ${rule}`
    ).toEqual([]);
    expect(
      drawn.bars.filter((b) => b.key === key && b.rule === rule),
      `${key} ${rule}`
    ).toEqual([]);
    const ring = drawn.rings.filter((r) => r.key === key && r.rule === rule);
    expect(ring, `${key} ${rule}`).toHaveLength(1);
    expect(ring[0].y, `${key} ${rule}`).toBeGreaterThan(lowest);
    expect(drawn.lines.filter((l) => l.key === key && (l.from === rule || l.to === rule))).toEqual([]);
  }
  await expect(bump(page).getByText(W.bump.out)).toBeVisible();
  // Every rank drawn is the rank that rule's own list gives, and every top-20 school has one mark per rule.
  for (const point of drawn.points) {
    const row = saved(point.rule).rows.find((r) => r.school.school_key === point.key)!;
    expect(row.cohort, `${point.key} ${point.rule}`).toBe("complete");
    expect(point.rank, `${point.key} ${point.rule}`).toBe(row.point_rank.rank);
  }
  for (const row of top) {
    const key = row.school.school_key;
    const marks = [...drawn.points, ...drawn.bars, ...drawn.rings].filter((m) => m.key === key);
    expect(marks.map((m) => m.rule).sort(), key).toEqual([...RULES].sort());
  }
});

test("draws a range as a bar spanning its ranks, joined to nothing, a range whose ends meet included", async ({
  page,
}) => {
  const top = topRows();
  const [wide, meeting] = [top[2].school.school_key, top[4].school.school_key];
  // The API's own shape for a school with a range under one rule: no rank, and its highest and lowest possible ranks.
  await page.route(listOf("need_first_no_u"), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const row of body.rows) {
      const bounds =
        row.school.school_key === wide ? [2, 9] : row.school.school_key === meeting ? [4, 4] : null;
      if (!bounds) continue;
      row.cohort = "interval";
      row.point_rank.rank = null;
      row.rank_bounds = { ...row.rank_bounds, best: bounds[0], worst: bounds[1], scope_code: "eligible" };
    }
    await route.fulfill({ response, json: body });
  });
  await openExplore(page);
  const drawn = await bumpDrawn(bump(page));
  const yOf = (rank: number) => drawn.points.find((p) => p.rule === "need_first_no_u" && p.rank === rank)?.y;
  for (const [key, best, worst] of [
    [wide, 2, 9],
    [meeting, 4, 4],
  ] as const) {
    expect(
      drawn.points.filter((p) => p.key === key && p.rule === "need_first_no_u"),
      key
    ).toEqual([]);
    const bar = drawn.bars.find((b) => b.key === key && b.rule === "need_first_no_u")!;
    expect(bar, key).toBeTruthy();
    expect([bar.best, bar.worst]).toEqual([best, worst]);
    // Taller than wide, so it never reads as a dot or a ring, and over every rank it spans.
    expect(bar.bottom - bar.top, key).toBeGreaterThan(bar.width * 1.5);
    for (const rank of [best, worst]) {
      const y = yOf(rank);
      if (y !== undefined) {
        expect(bar.top, `${key} ${rank}`).toBeLessThanOrEqual(y);
        expect(bar.bottom, `${key} ${rank}`).toBeGreaterThanOrEqual(y);
      }
    }
    expect(drawn.lines.filter((l) => l.key === key && [l.from, l.to].includes("need_first_no_u"))).toEqual(
      []
    );
  }
  await expect(bump(page).getByText(W.bump.range)).toBeVisible();
  // A bar is filled as a point is, and a ring is open, so the two never look alike, marked or not, ends meeting or not.
  const fills = (key: string) =>
    bump(page)
      .locator("svg")
      .evaluate((svg, key) => {
        const fill = (el: Element | null) => (el ? getComputedStyle(el).fill : null);
        const school = svg.querySelector(`g[data-school-key="${key}"]`)!;
        return {
          marked: school.hasAttribute("data-marked"),
          bar: fill(school.querySelector("rect[data-rule=need_first_no_u]")),
          point: fill(school.querySelector("circle[data-rank]")),
          ring: fill(svg.querySelector("g:not([data-marked]) > circle[data-out]")),
          panel: getComputedStyle(svg.closest("figure")!).backgroundColor,
        };
      }, key);
  for (const key of [wide, meeting]) {
    const drawnFills = await fills(key);
    expect(drawnFills.marked, key).toBe(false);
    expect(drawnFills.bar, key).toBe(drawnFills.point);
    expect(drawnFills.ring, key).toBe(drawnFills.panel);
    expect(drawnFills.bar, key).not.toBe(drawnFills.ring);
  }
  await openExplore(page, `?school=${meeting}`);
  const markedFills = await fills(meeting);
  expect(markedFills.marked).toBe(true);
  expect(markedFills.bar).toBe(markedFills.point);
  expect(markedFills.bar).not.toBe(markedFills.panel);
  expect(markedFills.bar).not.toBe(markedFills.ring);
  const meetingBar = (await bumpDrawn(bump(page))).bars.find(
    (b) => b.key === meeting && b.rule === "need_first_no_u"
  )!;
  expect(meetingBar.bottom - meetingBar.top).toBeGreaterThan(meetingBar.width * 1.5);
  await openTable(bump(page));
  const cell = (key: string) =>
    bump(page).locator(`tr[data-school-key="${key}"] td[data-rule=need_first_no_u]`);
  await expect(cell(wide)).toHaveText(LAYOUT.placeRange("2", "9"));
  await expect(cell(meeting)).toHaveText(W.bump.table.either("4"));

  // A school with a range under the main method, once marked, is added with a bar in the first column.
  const ranged = saved(MAIN).rows.find((r) => r.cohort === "interval")!;
  await page.unroute(listOf("need_first_no_u"));
  await openExplore(page, `?school=${ranged.school.school_key}`);
  const marked = await bumpDrawn(bump(page));
  expect(marked.marked).toEqual([ranged.school.school_key]);
  const first = marked.bars.find((b) => b.key === ranged.school.school_key && b.rule === MAIN)!;
  expect([first.best, first.worst]).toEqual([ranged.rank_bounds.best, ranged.rank_bounds.worst]);
  await expect(bump(page).locator("[data-region=bump-marked]")).toContainText(
    W.bump.ranged("the main method")
  );
});

test("the switch and the picker update both charts, the answer and the address", async ({ page }) => {
  await openExplore(page);
  const answer = frequencies(page).locator("[data-region=frequency-answer]");
  const flagged = (rule: string) =>
    saved(rule).rows.filter((r) => r.cohort !== "verification_queue" && r.persistent_candidate === true)
      .length;
  await expect(answer).toHaveText(W.frequencies.persistent(MAIN, flagged(MAIN), "80%"));
  const urgencyButton = frequencies(page).locator(`button[data-rule=${URGENCY}]`);
  await urgencyButton.click();
  await expect(urgencyButton).toHaveAttribute("aria-pressed", "true");
  await expect(answer).toHaveText(W.frequencies.persistent(URGENCY, flagged(URGENCY), "80%"));
  await expect(frequencies(page).locator("[data-region=frequency-test]")).toHaveText(W.frequencies.urgency);

  // The picker marks a school in the top 20 in every row of the dot plot and as the chart of ranks' navy line.
  const picker = page.getByLabel(EXPLORE.pick.label);
  const [first, second] = [topRows()[1].school, topRows()[6].school];
  for (const school of [first, second]) {
    await picker.selectOption(school.school_key);
    await expect(page).toHaveURL(new RegExp(`[?&]school=${school.school_key}(&|$)`));
    const rows = await rowsDrawn(frequencies(page));
    const hasShares = saved(URGENCY).rows.some(
      (r) => r.school.school_key === school.school_key && r.top20_frequencies
    );
    for (const row of rows)
      expect(row.dots.filter((d) => d.marked).map((d) => d.key)).toEqual(
        hasShares ? [school.school_key] : []
      );
    expect((await bumpDrawn(bump(page))).marked).toEqual([school.school_key]);
    await expect(frequencies(page).locator("[data-region=frequency-marked] b")).toHaveText(
      school.source_school_name
    );
  }
  await picker.selectOption("");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(section(page).locator("circle[data-marked], g[data-marked]")).toHaveCount(0);
  await expect(section(page).locator("[data-region=frequency-marked]")).toHaveCount(0);

  // The address marks the school when the page opens, in both charts.
  await openExplore(page, `?school=${first.school_key}`);
  expect((await bumpDrawn(bump(page))).marked).toEqual([first.school_key]);
  await expect(frequencies(page).locator("[data-region=frequency-marked] b")).toHaveText(
    first.source_school_name
  );

  // A school the main method ranks below its top 20 is added to the chart of ranks, and said to be: the saved lists
  // rank fewer than 21 schools, so its list ranks one of them 25th.
  const last = topRows().at(-1)!.school;
  await page.route(listOf(MAIN), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const row = body.rows.find((r: SavedRow) => r.school.school_key === last.school_key);
    row.point_rank.rank = 25;
    row.rank_bounds = { ...row.rank_bounds, best: 25, worst: 25 };
    await route.fulfill({ response, json: body });
  });
  await openExplore(page, `?school=${last.school_key}`);
  const drawn = await bumpDrawn(bump(page));
  expect(drawn.marked).toEqual([last.school_key]);
  expect(drawn.points.find((p) => p.key === last.school_key && p.rule === MAIN)!.rank).toBe(25);
  expect(drawn.points.find((p) => p.key === last.school_key && p.rule === MAIN)!.y).toBeGreaterThan(
    drawn.breakY!
  );
  await expect(bump(page).locator("[data-region=bump-marked]")).toContainText(
    W.bump.below("the main method", "25th")
  );
});

test("each table says what its chart draws", async ({ page }) => {
  const school = topRows()[3].school;
  await openExplore(page, `?school=${school.school_key}`);
  for (const rule of [MAIN, URGENCY]) {
    await frequencies(page).locator(`[data-region=frequency-switch] button[data-rule=${rule}]`).click();
    await openTable(frequencies(page));
    const table = await frequencies(page)
      .locator("table")
      .evaluate((t) =>
        [...t.querySelectorAll("tbody tr")].map((tr) => ({
          bin: tr.getAttribute("data-bin"),
          counts: [...tr.querySelectorAll("td")].map((td) => Number(td.textContent!.replace(/\D/g, ""))),
          marked: [...tr.querySelectorAll("td")].map((td) => td.hasAttribute("data-marked")),
        }))
      );
    const rows = await rowsDrawn(frequencies(page));
    for (const row of rows) {
      for (const tr of table.filter((t) => t.bin !== "undrawn"))
        expect(tr.counts[row.setting], `${rule} ${row.setting} bin ${tr.bin}`).toBe(
          row.dots.filter((d) => d.column === Number(tr.bin)).length
        );
      const markedDot = row.dots.find((d) => d.marked);
      const markedRows = table.filter((t) => t.marked[row.setting]).map((t) => Number(t.bin));
      expect(markedRows, `${rule} ${row.setting}`).toEqual(markedDot ? [markedDot.column] : []);
    }
  }

  await openTable(bump(page));
  const drawn = await bumpDrawn(bump(page));
  const cells = await bump(page)
    .locator("table tbody tr")
    .evaluateAll((trs) =>
      trs.flatMap((tr) =>
        [...tr.querySelectorAll("td")].map((td) => ({
          key: tr.getAttribute("data-school-key")!,
          rule: td.getAttribute("data-rule")!,
          text: td.textContent!.trim(),
        }))
      )
    );
  expect(cells.length).toBe(topRows().length * RULES.length);
  for (const cell of cells) {
    const point = drawn.points.find((p) => p.key === cell.key && p.rule === cell.rule);
    const bar = drawn.bars.find((b) => b.key === cell.key && b.rule === cell.rule);
    const ring = drawn.rings.find((r) => r.key === cell.key && r.rule === cell.rule);
    const label = `${cell.key} ${cell.rule}`;
    if (point) expect(cell.text, label).toBe(String(point.rank));
    else if (bar) expect(cell.text, label).toBe(LAYOUT.placeRange(String(bar.best), String(bar.worst)));
    else if (ring) expect(cell.text, label).toBe(W.bump.lane);
    else expect(cell.text, label).toBe(W.bump.table.none);
  }
  await expect(bump(page).locator("tr[data-marked]")).toHaveAttribute("data-school-key", school.school_key);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`fits a ${size.width} px phone with a school marked and both tables open`, async ({ page }) => {
    await page.setViewportSize(size);
    // A school with a range under the main method is added to the chart of ranks, its fullest state.
    const ranged = saved(MAIN).rows.find((r) => r.cohort === "interval")!;
    await openExplore(page, `?school=${ranged.school.school_key}`);
    await openTable(frequencies(page));
    await openTable(bump(page));
    const sideways = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(sideways).toBeLessThanOrEqual(0);
    for (const figure of [frequencies(page), bump(page)]) {
      const card = (await figure.boundingBox())!;
      const boxes = await figure
        .locator("svg circle, svg rect[data-best], svg line[data-from], [aria-hidden=true] span")
        .evaluateAll((els) =>
          els
            .filter((el) => getComputedStyle(el).display !== "none" && el.textContent !== null)
            .map((el) => {
              const r =
                el instanceof HTMLElement && el.textContent
                  ? (() => {
                      const range = document.createRange();
                      range.selectNodeContents(el);
                      return range.getBoundingClientRect();
                    })()
                  : el.getBoundingClientRect();
              return { x: r.x, width: r.width, text: el.textContent ?? "" };
            })
            .filter((r) => r.width > 0)
        );
      expect(boxes.length).toBeGreaterThan(10);
      for (const box of boxes) {
        expect(box.x, box.text).toBeGreaterThanOrEqual(card.x - 0.5);
        expect(box.x + box.width, box.text).toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
    }
    // The column names over the chart of ranks never cover one another.
    const heads = await bump(page)
      .locator("[aria-hidden=true] [data-group]")
      .evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return { left: r.left, right: r.right };
        })
      );
    expect(heads.length).toBe(4);
    for (let i = 1; i < heads.length; i += 1)
      expect(heads[i].left).toBeGreaterThanOrEqual(heads[i - 1].right);
    // The table of ranks scrolls inside its card and can be reached with a keyboard to do so.
    const region = bump(page).getByRole("region");
    await expect(region).toHaveAttribute("tabindex", "0");
  });

/** A column's range as its label under the dot plot names it, from 0 to 1, both ends held to the label's rounding. */
function rangeOf(label: string): [number, number] {
  const n = [...label.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0]) / 100);
  if (label === "0%") return [0, 0];
  if (label === "100%") return [1, 1];
  if (label.startsWith("under ")) return [0, n[0]];
  if (label.startsWith("over ") || label.startsWith("from ")) return [n[0], 1];
  expect(label).toMatch(/^\d+(\.\d)? to \d+(\.\d)?$/);
  return [n[0], n[1]];
}

for (const size of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`names each column's range under it, and says the columns are not to scale, at ${size.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openExplore(page);
    for (const rule of [MAIN, URGENCY]) {
      await frequencies(page).locator(`[data-region=frequency-switch] button[data-rule=${rule}]`).click();
      await expect(frequencies(page)).toHaveAttribute("data-rule", rule);
      // The columns the saved test asks for: 0%, the low tail split at 10% and 50%, 70%, the band and the line.
      const { threshold, standard_error: se, adjacency_standard_errors: k = 1 } = saved(rule).persistence!;
      const [lo, hi] = [threshold - se * k, threshold + se * k].map((f) => (f * 100).toFixed(1));
      expect(threshold).toBe(0.8);
      const expected = [
        "0%",
        "under 10",
        "10 to 50",
        "50 to 70",
        `70 to ${lo}`,
        `${lo} to 80`,
        `80 to ${hi}`,
        `over ${hi}`,
        "100%",
      ];

      const drawn = await frequencies(page).evaluate((figure) => {
        const svg = figure.querySelector("[data-setting] svg")!.getBoundingClientRect();
        const line = figure.querySelector("[data-setting] [data-part=line]")!;
        const band = figure.querySelector("[data-setting] [data-part=band]")!;
        const name = figure.querySelector("[data-region=frequency-line] > span")!.getBoundingClientRect();
        return {
          card: figure.getBoundingClientRect().right - parseFloat(getComputedStyle(figure).borderRightWidth),
          svg: { left: svg.left, width: svg.width },
          lineX: svg.left + Number(line.getAttribute("x1")),
          band: {
            left: svg.left + Number(band.getAttribute("x")),
            right: svg.left + Number(band.getAttribute("x")) + Number(band.getAttribute("width")),
          },
          name: {
            text: figure.querySelector("[data-region=frequency-line]")!.textContent,
            centre: (name.left + name.right) / 2,
          },
          columns: [...figure.querySelectorAll("[data-region=frequency-columns] > span")].map((span) => {
            const box = span.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(span);
            const text = range.getBoundingClientRect();
            return {
              text: span.textContent!,
              left: box.left,
              right: box.right,
              textLeft: text.left,
              textRight: text.right,
              visible: getComputedStyle(span).visibility === "visible" && text.width > 0,
              overflow: span.scrollWidth - span.clientWidth,
              line: span.hasAttribute("data-line"),
              band: span.hasAttribute("data-band"),
            };
          }),
        };
      });
      const label = `${rule} at ${size.width}`;
      expect(
        drawn.columns.map((c) => c.text),
        label
      ).toEqual(expected);
      const step = drawn.svg.width / expected.length;
      drawn.columns.forEach((column, b) => {
        const where = `${label} column ${b} ${column.text}`;
        // Each label is shown, under its own column, its words inside it and clear of its neighbours. The last, with
        // nothing after it, may run past the plot's edge into the card's margin, never past the card.
        expect(column.visible, where).toBe(true);
        expect(column.left, where).toBeCloseTo(drawn.svg.left + b * step, 0);
        expect(column.right, where).toBeCloseTo(drawn.svg.left + (b + 1) * step, 0);
        expect(column.textLeft, where).toBeGreaterThanOrEqual(column.left - 0.5);
        if (b < expected.length - 1) {
          expect(column.textRight, where).toBeLessThanOrEqual(column.right + 0.5);
          expect(column.overflow, where).toBeLessThanOrEqual(0);
        } else expect(column.textRight, where).toBeLessThanOrEqual(drawn.card);
      });
      // The line runs between "78.9 to 80" and "80 to 81.1", down to its name; the band's columns are its two.
      const lineAt = drawn.columns.findIndex((c) => c.line);
      expect(drawn.columns[lineAt].text, label).toMatch(/^80 to /);
      expect(drawn.lineX, label).toBeCloseTo(drawn.columns[lineAt].left, 0);
      expect(drawn.name.text, label).toBe(W.frequencies.line("80%"));
      expect(Math.abs(drawn.name.centre - drawn.lineX), label).toBeLessThanOrEqual(1.5);
      expect(
        drawn.columns.flatMap((c, b) => (c.band ? [b] : [])),
        label
      ).toEqual([lineAt - 1, lineAt]);
      expect(drawn.band.left, label).toBeCloseTo(drawn.columns[lineAt - 1].left, 0);
      expect(drawn.band.right, label).toBeCloseTo(drawn.columns[lineAt].right, 0);

      // Every dot's share, from the saved list, is in the range its column's label names: no column misleads.
      const shares = new Map(
        saved(rule)
          .rows.filter((r) => r.cohort !== "verification_queue" && r.top20_frequencies)
          .map((r) => [r.school.school_key, r.top20_frequencies!.map((f) => f.frequency)])
      );
      for (const row of await rowsDrawn(frequencies(page)))
        for (const dot of row.dots) {
          const f = shares.get(dot.key)![row.setting];
          const [from, to] = rangeOf(expected[dot.column]);
          const where = `${label} ${dot.key} at ${f} in ${expected[dot.column]}`;
          expect(f, where).toBeGreaterThanOrEqual(from - 0.0005);
          expect(f, where).toBeLessThanOrEqual(to + 0.0005);
          expect(dot.left, where).toBeGreaterThanOrEqual(dot.column * step - 0.5);
          expect(dot.right, where).toBeLessThanOrEqual((dot.column + 1) * step + 0.5);
        }

      // Beside the axis, one sentence says the columns are ranges of different widths drawn the same width.
      const scale = frequencies(page).locator("[data-region=frequency-scale]");
      await expect(scale).toBeVisible();
      await expect(scale).toHaveText(W.frequencies.notToScale("80%", true));
      expect(await scale.evaluate((p) => p.previousElementSibling?.textContent)).toBe(W.frequencies.axis);
    }
  });

test("says in the dot plot why the earlier method's test cannot be shown yet, and retries it there", async ({
  page,
  problems,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let fail = true;
  await page.route(listOf(URGENCY), async (route) => {
    if (!fail) return route.continue();
    await held;
    return route.fulfill({ status: 503, json: { error: { code: "mock_failure", message: "down" } } });
  });
  await page.goto("/explore");
  await expect(section(page)).toBeAttached({ timeout: 45_000 });
  await section(page).scrollIntoViewIfNeeded();
  const button = frequencies(page).locator(`[data-region=frequency-switch] button[data-rule=${URGENCY}]`);
  const reason = async () => page.locator(`[id="${await button.getAttribute("aria-describedby")}"]`);

  // While its list is on its way, the button cannot be pressed, and the line it points to says why.
  await expect(button).toBeDisabled({ timeout: 45_000 });
  await expect(frequencies(page).locator("svg circle").first()).toBeVisible();
  await expect(await reason()).toHaveText(W.frequencies.urgencyLoading);
  await expect(await reason()).toHaveAttribute("role", "status");

  // When it fails, the line says so beside a Retry, in the dot plot itself.
  release();
  const alert = frequencies(page).getByRole("alert");
  await expect(alert).toContainText(W.frequencies.urgencyFailed, { timeout: 45_000 });
  await expect(button).toBeDisabled();
  await expect(await reason()).toHaveAttribute("role", "alert");
  await expect(frequencies(page).locator("[data-region=frequency-answer]")).toHaveText(
    /^In the main method's own test, /
  );
  problems.length = 0;

  fail = false;
  await alert.getByRole("button", { name: LAYOUT.retry }).click();
  await expect(button).toBeEnabled({ timeout: 45_000 });
  await expect(button).not.toHaveAttribute("aria-describedby", /./);
  await expect(frequencies(page).locator("[data-region=frequency-wait]")).toHaveCount(0);
  await button.click();
  await expect(frequencies(page)).toHaveAttribute("data-rule", URGENCY);
  // The chart of ranks, which waited on the same list, is drawn too.
  await expect(bump(page).locator("svg circle").first()).toBeVisible({ timeout: 45_000 });
  await expect(bump(page).getByRole("alert")).toHaveCount(0);
});

/** Lets an observer that the last layout or scroll set off report, and any read it asks for start. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300))))
  );

for (const size of [
  { width: 1440, height: 900 },
  { width: 1600, height: 1000 },
  { width: 390, height: 844 },
])
  test(`reads only the main list on a first load at ${size.width} px, the others once set 2 is on screen, and the earlier method's once`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const asked: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/v1/"))
        asked.push(
          url.pathname.split("/").pop()! +
            (url.searchParams.has("rule") ? `:${url.searchParams.get("rule")}` : "")
        );
    });
    await page.goto("/explore");
    await expect(page.locator("figure[data-part] svg circle").first()).toBeVisible({ timeout: 45_000 });
    await settle(page);
    // Set 2 starts below the first screen, so a reader who never scrolls has no need of the other lists.
    expect(await section(page).evaluate((s) => s.getBoundingClientRect().top)).toBeGreaterThan(size.height);
    await expect(section(page)).toHaveAttribute("data-lists", "waiting");
    expect([...asked].sort()).toEqual(["inputs", "results:" + MAIN, "rules"]);

    await section(page).scrollIntoViewIfNeeded();
    await expect(bump(page).locator("svg circle").first()).toBeVisible({ timeout: 45_000 });
    expect(asked.filter((a) => a.startsWith("results:")).sort()).toEqual(
      RULES.map((r) => "results:" + r).sort()
    );

    // The drivers' own switch to the earlier method's list finds it already read.
    const drivers = page.locator("[data-region=drivers]");
    await drivers.scrollIntoViewIfNeeded();
    await drivers.getByRole("radio", { name: DRIVERS.rules.urgency }).check();
    await expect(drivers.locator("[data-rule]").first()).toHaveAttribute("data-rule", URGENCY);
    expect(asked.filter((a) => a === "results:" + URGENCY)).toHaveLength(1);
  });

test("says in the chart when another rule's list fails, and recovers on Retry", async ({
  page,
  problems,
}) => {
  let fail = true;
  await page.route(listOf("benchmark"), async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { error: { code: "mock_failure", message: "down" } } });
    return route.continue();
  });
  await page.goto("/explore");
  await expect(section(page)).toBeAttached({ timeout: 45_000 });
  await section(page).scrollIntoViewIfNeeded();
  const alert = bump(page).getByRole("alert");
  await expect(alert).toContainText(LAYOUT.loadFailed, { timeout: 45_000 });
  // The rest of the page stays as it was: set 1's charts and the main method's own test.
  await expect(page.locator("figure[data-part] svg circle").first()).toBeVisible();
  await expect(frequencies(page).locator("svg circle").first()).toBeVisible();
  problems.length = 0;

  fail = false;
  await alert.getByRole("button", { name: LAYOUT.retry }).click();
  await expect(bump(page).locator("svg circle").first()).toBeVisible({ timeout: 45_000 });
  await expect(bump(page).locator("[data-rule=benchmark]").first()).toBeAttached();
  await expect(bump(page).getByRole("alert")).toHaveCount(0);
});
