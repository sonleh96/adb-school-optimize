/**
 * The explore page's province section: where the schools of the list come from, the top 20 among them, and the
 * records not in the list yet, by reason. Failure modes, each with the test that catches it:
 *  1. The counts do not add up to the totals the app shows elsewhere: the page's own count of the list and the
 *     workspace's two tabs                   -> "adds up to the list the page holds and to the workspace's two tabs"
 *  2. The records to verify split another way than the app's: the record with a missing count and 0 classrooms counts
 *     as 0 classrooms, or twice, or 0 teachers counts as 0 classrooms
 *                                            -> "counts each record to verify once, under the first reason ..."
 *  3. The records with no province are dropped, or a province with no school in the list is
 *                                            -> "draws every province ..."
 *  4. A range school is counted twice, not at all, or in the top 20
 *                                            -> "draws every province ..."
 *  5. The marked school's province is not the row marked, or another row is marked too
 *                                            -> "marks the province of the school the picker marks ..."
 *  6. On a 390 or 360 px phone a long province name, a bar or a count leaves its card or covers the other side, or
 *     the page scrolls sideways              -> "fits a 390 and a 360 px phone ..."
 *  7. The tables give another number than the bars and their counts, or list the provinces in another order
 *                                            -> "draws every province ..."
 *  8. A keyboard cannot open the tables, or a screen reader reads the drawing instead of its words and tables
 *                                            -> "a keyboard opens the tables ..."
 * The expected counts come from the dataset's definition in services/api/scripts/generate_screening_fixtures.py
 * (`provinces_records`): 24 complete schools of which 20 rank 1 to 20, 2 range schools and 8 records to verify.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { EXPLORE } from "../lib/screening/copy/explore";
import { EXPLORE_PROVINCE as WORDS } from "../lib/screening/copy/explore-province";

import { expect, test, useMockDataset, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const MAIN = "additive_no_u";
const LONG = "Autonomous Region of the Far Eastern Isles";
/** Province, in the list, in the top 20, not in the list yet: the chart's rows and the first table's, in order. */
const ROWS: [string, number, number, number][] = [
  [LONG, 5, 2, 1],
  ["East Province", 5, 5, 2],
  ["North Province", 9, 8, 1],
  ["South Province", 6, 4, 1],
  ["West Province", 0, 0, 2],
  [WORDS.unrecorded, 1, 1, 1],
];
/** Province, a detail missing, 0 classrooms, another reason: the second table's rows. */
const REASONS: [string, number, number, number][] = [
  [LONG, 0, 1, 0],
  // A record with a missing count and 0 classrooms, and one with 0 teachers: one detail missing and one other.
  ["East Province", 1, 0, 1],
  ["North Province", 1, 0, 0],
  ["South Province", 0, 1, 0],
  ["West Province", 1, 0, 1],
  [WORDS.unrecorded, 1, 0, 0],
];

const keyOf = (name: string): string => {
  const file = path.resolve(__dirname, `fixtures/screening/provinces/results/${MAIN}.json`);
  const rows: { school: { school_key: string; source_school_name: string } }[] = JSON.parse(
    readFileSync(file, "utf8")
  ).rows;
  return rows.find((row) => row.school.source_school_name === name)!.school.school_key;
};

const section = (page: Page) => page.locator("[data-region=province]");
const chartRows = (page: Page) => page.locator("[data-region=province-chart] > [data-province]");

async function openSection(page: Page, search = "") {
  await page.goto(`/explore${search}`);
  await expect(chartRows(page).first()).toBeVisible({ timeout: 30_000 });
}

/** The tables' rows, opened from the section's own button: the header cell, then each count. */
async function tablesOf(page: Page): Promise<{ counts: string[][]; reasons: string[][] }> {
  const button = section(page).getByRole("button", { name: EXPLORE.table.show });
  if (await button.isVisible()) await button.click();
  const read = (table: Locator) =>
    table
      .locator("tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [...tr.children].map((cell) => cell.childNodes[0]?.textContent?.trim() ?? ""))
      );
  return {
    counts: await read(page.locator("[data-region=province-table]")),
    reasons: await read(page.locator("[data-region=province-reasons-table]")),
  };
}

/** What each row of the drawing shows: its name, each side's count, and the widths of its bar and parts. */
async function drawnRows(page: Page) {
  return chartRows(page).evaluateAll((rows) =>
    rows.map((row) => {
      const width = (selector: string) => row.querySelector(selector)?.getBoundingClientRect().width ?? 0;
      const label = (side: string) => row.querySelector(`[data-side=${side}] > :last-child`)!.textContent;
      const inside = row.querySelector("[data-segment=top] > span");
      return {
        name: row.getAttribute("data-province"),
        marked: row.hasAttribute("data-marked"),
        list: Number(label("list")),
        waiting: Number(label("waiting")),
        bar: width("[data-side=list] > span:first-child:not(:last-child)"),
        top: width("[data-segment=top]"),
        rest: width("[data-segment=rest]"),
        waitingBar: width("[data-side=waiting] > span:first-child:not(:last-child)"),
        inside: inside && getComputedStyle(inside).display !== "none" ? Number(inside.textContent) : null,
      };
    })
  );
}

test("draws every province from A to Z, the records with no province last, as its tables say", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "provinces");
  await openSection(page);
  const drawn = await drawnRows(page);
  expect(drawn.map((row) => [row.name, row.list, row.waiting])).toEqual(ROWS.map(([n, l, , w]) => [n, l, w]));

  // One scale for both sides: every bar is its count times the same length.
  const bars = drawn.flatMap((row) => [
    { count: row.list, width: row.bar },
    { count: row.waiting, width: row.waitingBar },
  ]);
  const most = bars.reduce((a, b) => (b.count > a.count ? b : a));
  const unit = most.width / most.count;
  for (const bar of bars)
    expect(Math.abs(bar.width - bar.count * unit), JSON.stringify(bar)).toBeLessThan(1.5);
  // The top 20 from the baseline, the rest of the list after a 2 px gap, each as long as its count.
  for (const [row, [name, inList, top20]] of drawn.map((r, i) => [r, ROWS[i]] as const)) {
    if (top20 === 0) expect(row.top, name).toBe(0);
    else if (top20 === inList) expect(Math.abs(row.top - row.bar), name).toBeLessThan(1);
    else {
      expect(Math.abs(row.top - ((row.bar - 2) * top20) / inList), name).toBeLessThan(1.5);
      expect(Math.abs(row.top + 2 + row.rest - row.bar), name).toBeLessThan(1);
    }
    // A count inside the navy part, where it shows, is the top 20's.
    if (row.inside !== null) expect(row.inside, name).toBe(top20);
  }
  expect(drawn.filter((row) => row.inside !== null).length).toBeGreaterThan(1);

  const { counts, reasons } = await tablesOf(page);
  expect(counts).toEqual([
    [WORDS.table.province, WORDS.table.inList, WORDS.table.top, WORDS.table.notYet],
    ...ROWS.map((row) => row.map(String)),
    [WORDS.table.total, "26", "20", "8"],
  ]);
  expect(reasons).toEqual([
    [WORDS.table.province, WORDS.table.missing, WORDS.table.zero, WORDS.table.other],
    ...REASONS.map((row) => row.map(String)),
    [WORDS.table.total, "4", "2", "2"],
  ]);
  await expect(section(page).locator("[data-region=province-answer]")).toHaveText(WORDS.answer(5, 4, 1));
  await expect(section(page).getByText(WORDS.order(true))).toBeVisible();
});

test("counts each record to verify once, under the first reason that holds, and says so", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "provinces");
  await openSection(page);
  await expect(section(page).locator("[data-region=province-reasons]")).toHaveText(WORDS.reasons(8, 4, 2, 2));
  // Both range schools' possible ranks reach the top 20 (best ranks 17th and 18th in the saved list), yet each counts
  // with the other schools in the list.
  await expect(section(page).locator("[data-region=province-top]")).toHaveText(
    `${WORDS.top(24, MAIN)} ${WORDS.ranges(2, 2)}`
  );
});

for (const [dataset, listed, queued, top] of [
  ["provinces", 26, 8, 20],
  // The default dataset holds 17 schools with one rank, so all of them are in the top 20.
  ["default", 22, 3, 17],
] as const)
  test(`adds up to the list the page holds and to the workspace's two tabs, dataset ${dataset}`, async ({
    page,
    context,
  }) => {
    await useMockDataset(context, dataset);
    await openSection(page);
    const { counts } = await tablesOf(page);
    expect(counts.at(-1)).toEqual([WORDS.table.total, String(listed), String(top), String(queued)]);
    await expect(page.locator("[data-region=scope]")).toContainText(
      EXPLORE.scope(listed, "").split(" that ")[0]
    );
    // A list of fewer than 20 schools with one rank says that all of them are in the top 20.
    if (top < 20)
      await expect(section(page).locator("[data-region=province-top]")).toContainText(WORDS.top(top, MAIN));
    await page.goto("/screening");
    await waitForMap(page);
    await expect(page.getByRole("tab", { name: /The list/ })).toHaveText(`The list(${listed})`);
    await expect(page.getByRole("tab", { name: /Not in the list yet/ })).toHaveText(
      `Not in the list yet(${queued})`
    );
  });

test("marks the province of the school the picker marks, and only that one", async ({ page, context }) => {
  await useMockDataset(context, "provinces");
  const markedRows = async () => (await drawnRows(page)).filter((row) => row.marked).map((row) => row.name);
  for (const [school, province, inList] of [
    ["Isles Top 01", LONG, 5],
    // A range school is in the list, so the picker offers it and its province is marked.
    ["North Range", "North Province", 9],
    ["Nowhere Top 01", null, 1],
  ] as const) {
    await openSection(page, `?school=${keyOf(school)}`);
    expect(await markedRows(), school).toEqual([province ?? WORDS.unrecorded]);
    await expect(section(page).locator("[data-region=province-marked]"), school).toHaveText(
      `${school} ${WORDS.marked(province, inList)}`
    );
    const { counts } = await tablesOf(page);
    await expect(page.locator("[data-region=province-table] tr[data-marked]"), school).toHaveCount(1);
    await expect(page.locator("[data-region=province-table] tr[data-marked] th"), school).toHaveText(
      `${province ?? WORDS.unrecorded}${EXPLORE.table.marked}`
    );
    expect(counts.length).toBe(ROWS.length + 2);
  }

  // The picker moves the mark; clearing it leaves no province marked.
  const picker = page.getByLabel(EXPLORE.pick.label);
  await picker.selectOption(keyOf("South Top 01"));
  await expect.poll(markedRows).toEqual(["South Province"]);
  await picker.selectOption("");
  await expect.poll(markedRows).toEqual([]);
  await expect(section(page).locator("[data-region=province-marked]")).toHaveCount(0);

  // A record still to verify is not in the list, so the address marks no school and no province.
  await openSection(page, `?school=${keyOf("West Missing")}`);
  expect(await markedRows()).toEqual([]);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`fits a ${size.width} px phone with the long province marked and both tables open`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(size);
    await useMockDataset(context, "provinces");
    await openSection(page, `?school=${keyOf("Isles Top 01")}`);
    await tablesOf(page);
    const sideways = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(sideways).toBeLessThanOrEqual(0);
    const problems = await section(page).evaluate((root) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const within = (inner: DOMRect, outer: DOMRect) =>
        inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
      const textBox = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      };
      const found: string[] = [];
      const card = box(root.querySelector("figure")!);
      for (const el of root.querySelectorAll("figure *")) {
        const r = box(el);
        if (r.width > 0 && !within(r, card)) found.push(`outside the card: ${el.tagName} ${el.className}`);
      }
      for (const row of root.querySelectorAll("[data-region=province-chart] > [data-province]")) {
        const name = row.getAttribute("data-province");
        const [list, waiting] = [...row.querySelectorAll("[data-side]")];
        // A side's count stays on its own side, after its bar.
        for (const side of [list, waiting]) {
          const value = textBox(side.lastElementChild!);
          if (!within(value, box(side))) found.push(`${name}: a count leaves its side`);
        }
        if (textBox(list.lastElementChild!).right > box(waiting).left)
          found.push(`${name}: the list's count covers the other side`);
        if (!within(textBox(row.firstElementChild!), box(row)))
          found.push(`${name}: the name leaves its row`);
        const inside = row.querySelector("[data-segment=top] > span");
        if (
          inside &&
          getComputedStyle(inside).display !== "none" &&
          !within(textBox(inside), box(inside.parentElement!))
        )
          found.push(`${name}: the top 20's count leaves its part`);
      }
      return found;
    });
    expect(problems).toEqual([]);
    // The long name is whole, on a line of its own above the bars, so it wraps once at most rather than being
    // squeezed beside them.
    await expect(chartRows(page).first()).toContainText(LONG);
    const lines = await chartRows(page)
      .first()
      .locator(":scope > :first-child")
      .evaluate((name) => {
        // The name's own text, without the marked school's key beside it.
        const text = [...name.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      });
    expect(lines).toBeLessThanOrEqual(2);
  });

test("a keyboard opens the tables, and a screen reader hears the words and tables, not the drawing", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "provinces");
  await openSection(page, `?school=${keyOf("Isles Top 01")}`);
  // From the page's one control, Tab moves down the page, through the charts above, to the section's button.
  const button = section(page).getByRole("button", { name: EXPLORE.table.show });
  await page.getByLabel(EXPLORE.pick.label).focus();
  for (let stop = 0; stop < 40 && !(await button.evaluate((el) => el === document.activeElement)); stop += 1)
    await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(section(page).getByRole("button", { name: EXPLORE.table.hide })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(page.getByRole("figure", { name: WORDS.title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: WORDS.question })).toBeVisible();
  for (const name of [WORDS.title, WORDS.table.reasons]) {
    const table = page.getByRole("table", { name });
    await expect(table, name).toBeVisible();
    await expect(table.getByRole("rowheader", { name: LONG }), name).toBeVisible();
  }
  await expect(section(page).locator("[data-region=province-chart]")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("table", { name: WORDS.title }).locator("tr[data-marked]")).toContainText(LONG);
});
