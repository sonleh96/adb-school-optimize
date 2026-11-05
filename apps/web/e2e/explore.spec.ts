/**
 * The explore page at /explore: charts of every school the main method puts in order, set 1 (how the schools of the
 * list compare on each part of school need). Failure modes, each with the test that catches it:
 *  1. A dot sits in another column than its record gives, or outside its own column, at ties and at both ends; or a
 *     chart's table gives another count than its dots show
 *                                        -> "puts every school of the list in the column its record gives ..."
 *  2. A school whose record gives no figure is drawn as a zero
 *                                        -> "a school whose record gives no figure has no dot ..."
 *  3. The marked school is not the one `?school=` names, or the address and the picker drift apart
 *                                        -> "marks the school the address names in every chart ..."
 *  4. The /screening first screen changes: a link to the page shows before Help is opened, or Help loses or reorders
 *     its items                          -> "the tool's first screen shows no new link ..."
 *  5. A chart cannot be reached with a keyboard or read with a screen reader
 *                                        -> "a keyboard reaches the picker and every chart's numbers ..."
 *  6. On a 390 or 360 px phone the page scrolls sideways, or a dot or a label leaves its card or covers another
 *                                        -> "fits a 390 and a 360 px phone ..."
 *  7. With no data, or a read that fails, the page shows nothing a reader can act on, or never recovers
 *                                        -> "says when there is no data, and recovers from a failed read"
 * Sign-in is checked in auth-static.spec.ts with the other pages, and the first load in scripts/check-bundle-budget.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { EXPLORE } from "../lib/screening/copy/explore";
import { HELP, LAYOUT } from "../lib/screening/copy/words";

import { APP_ORIGIN, type MockDataset, expect, test, useMockDataset, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const MAIN = "additive_no_u";
const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const read = (dataset: MockDataset, file: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, dataset === "default" ? "" : dataset, file), "utf8"));

interface Row {
  cohort: string;
  school: { school_key: string; source_school_name: string };
}
type Inputs = Record<string, number | string | null>;
const rowsOf = (dataset: MockDataset): Row[] => read(dataset, `results/${MAIN}.json`).rows;
const listedOf = (dataset: MockDataset) => rowsOf(dataset).filter((r) => r.cohort !== "verification_queue");
const inputsOf = (dataset: MockDataset): Map<string, Inputs> =>
  new Map(
    (read(dataset, "inputs.json").schools as { school_key: string; inputs: Inputs }[]).map((s) => [
      s.school_key,
      s.inputs,
    ])
  );

const PARTS = ["classrooms", "housing", "facilities", "services", "locality"] as const;
const FACILITIES = [
  "libraries",
  "workshops",
  "practical_skills_buildings",
  "home_economics_buildings",
  "computer_labs",
  "specialized_classrooms",
];
const figureOf = (page: Page, key: (typeof PARTS)[number]) => page.locator(`figure[data-part=${key}]`);

async function openExplore(page: Page, search = "") {
  await page.goto(`/explore${search}`);
  await expect(page.locator("figure[data-part]")).toHaveCount(PARTS.length, { timeout: 30_000 });
  await expect(page.locator("figure[data-part] svg circle").first()).toBeVisible();
}

/** The table's rows, opened from the chart's own button: each row's label and count. */
async function tableOf(figure: Locator): Promise<{ label: string; count: number }[]> {
  const button = figure.getByRole("button", { name: EXPLORE.table.show });
  if (await button.isVisible()) await button.click();
  const rows = figure.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((trs) =>
    trs.map((tr) => ({
      label: tr.querySelector("th")!.childNodes[0].textContent!.trim(),
      count: Number(tr.querySelector("td")!.textContent!.replace(/,/g, "")),
    }))
  );
}

/** Each drawn dot: its column, its school, whether it is marked, and how far it reaches across the drawing. */
async function dotsOf(figure: Locator) {
  return figure.locator("svg").evaluate((svg) => {
    const width = Number(svg.getAttribute("width"));
    return {
      width,
      dots: [...svg.querySelectorAll("circle")].map((c) => ({
        column: Number(c.getAttribute("data-column")),
        key: c.getAttribute("data-school-key"),
        marked: c.hasAttribute("data-marked"),
        left: Number(c.getAttribute("cx")) - Number(c.getAttribute("r")),
        right: Number(c.getAttribute("cx")) + Number(c.getAttribute("r")),
      })),
    };
  });
}

const counted = (columns: number[], size: number) =>
  Array.from({ length: size }, (_, i) => columns.filter((c) => c === i).length);

test("puts every school of the list in the column its record gives, ties and both ends included", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "ties-and-ranges");
  await openExplore(page);
  const listed = listedOf("ties-and-ranges");
  const inputs = inputsOf("ties-and-ranges");
  // The steps as the requirement states them, from the saved records: a share of none, by quarters, or all of them;
  // and how many of the six facility types the record has at least one of.
  const shareColumn = (part: number, whole: number) => {
    const share = Math.min(part / whole, 1);
    return share === 0 ? 0 : share === 1 ? 5 : 1 + Math.floor(share * 4);
  };
  const expected = {
    classrooms: counted(
      listed.map((r) => {
        const i = inputs.get(r.school.school_key)!;
        return shareColumn(i.permanent_classrooms as number, i.total_classrooms as number);
      }),
      6
    ),
    facilities: counted(
      listed.map((r) => FACILITIES.filter((f) => (inputs.get(r.school.school_key)![f] as number) > 0).length),
      7
    ),
  };

  for (const key of PARTS) {
    const figure = figureOf(page, key);
    // Every school of this dataset has every part recorded, so each row of the table is a column of the chart.
    const table = await tableOf(figure);
    expect(
      table.map((row) => row.label),
      key
    ).not.toContain(EXPLORE.table.unrecorded);
    const { width, dots } = await dotsOf(figure);
    const drawn = counted(
      dots.map((d) => d.column),
      table.length
    );
    // The table and the dots say the same, and between them hold every school of the list.
    expect(drawn, key).toEqual(table.map((row) => row.count));
    expect(dots, key).toHaveLength(listed.length);
    // Each dot stays inside its own column, the first and the last included.
    const step = width / table.length;
    for (const dot of dots) {
      expect(dot.left, `${key} ${dot.key}`).toBeGreaterThanOrEqual(dot.column * step - 0.5);
      expect(dot.right, `${key} ${dot.key}`).toBeLessThanOrEqual((dot.column + 1) * step + 0.5);
    }
    if (key === "classrooms" || key === "facilities") expect(drawn, key).toEqual(expected[key]);
  }
  // The fixture's ties: more than one school shares a column in every chart.
  for (const key of PARTS)
    expect(Math.max(...(await tableOf(figureOf(page, key))).map((r) => r.count))).toBeGreaterThan(1);
});

test("a school whose record gives no figure has no dot, and is counted as not recorded", async ({ page }) => {
  const listed = listedOf("default");
  const blank = listed[0].school.school_key;
  // The stored inputs as the API might send them, with one ranked school's classroom count left blank.
  await page.route("**/api/v1/screening/inputs**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const school of body.schools) if (school.school_key === blank) school.inputs.total_classrooms = null;
    await route.fulfill({ response, json: body });
  });
  await openExplore(page, `?school=${blank}`);

  const classrooms = figureOf(page, "classrooms");
  const { dots } = await dotsOf(classrooms);
  expect(dots).toHaveLength(listed.length - 1);
  expect(dots.map((d) => d.key)).not.toContain(blank);
  await expect(classrooms.getByText(EXPLORE.unrecorded(1))).toBeVisible();
  const table = await tableOf(classrooms);
  expect(table.at(-1)).toEqual({ label: EXPLORE.table.unrecorded, count: 1 });
  await expect(classrooms.locator("tr[data-marked]")).toContainText(EXPLORE.table.marked);
  expect(table.reduce((sum, row) => sum + row.count, 0)).toBe(listed.length);
  // Its other parts are recorded, so it is still drawn, and marked, in every other chart.
  for (const key of PARTS.filter((k) => k !== "classrooms"))
    await expect(figureOf(page, key).locator(`circle[data-marked][data-school-key="${blank}"]`)).toHaveCount(
      1
    );
});

test("marks the school the address names in every chart, and keeps the address and the picker in step", async ({
  page,
}) => {
  const listed = listedOf("default");
  const [first, second] = [listed[2].school, listed[7].school];
  await openExplore(page, `?school=${first.school_key}`);
  const picker = page.getByLabel(EXPLORE.pick.label);
  await expect(picker).toHaveValue(first.school_key);

  const markedIn = async (key: string) => {
    for (const part of PARTS) {
      const marked = figureOf(page, part).locator("circle[data-marked]");
      await expect(marked, part).toHaveCount(1);
      await expect(marked, part).toHaveAttribute("data-school-key", key);
    }
  };
  await markedIn(first.school_key);
  await expect(page.locator("[data-region=legend]")).toContainText(first.source_school_name);
  for (const part of PARTS)
    await expect(figureOf(page, part).locator("[data-region=marked-lines] b")).toHaveText(
      first.source_school_name
    );

  await picker.selectOption(second.school_key);
  await expect(page).toHaveURL(new RegExp(`[?&]school=${second.school_key}(&|$)`));
  await markedIn(second.school_key);

  await picker.selectOption("");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator("circle[data-marked]")).toHaveCount(0);
  await expect(page.locator("[data-region=marked-lines]")).toHaveCount(0);

  // A key the list does not hold, unknown or a record still to verify, marks nothing and says so.
  const queued = rowsOf("default").find((r) => r.cohort === "verification_queue")!.school.school_key;
  for (const key of ["no-such-school", queued]) {
    await openExplore(page, `?school=${key}`);
    await expect(page.getByText(EXPLORE.pick.notInList)).toBeVisible();
    await expect(picker).toHaveValue("");
    await expect(page.locator("circle[data-marked]")).toHaveCount(0);
  }
});

test("the tool's first screen shows no new link; Help lists the page last, and its link opens it", async ({
  page,
}) => {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/screening");
    await waitForMap(page);
    await expect(page.getByRole("link", { name: LAYOUT.explore })).toHaveCount(0);
    await page.locator("[data-region=help-button]").filter({ visible: true }).click();
    const menu = page.locator("#screening-help-menu");
    const items = menu.locator(":scope > button, :scope > a");
    await expect(items).toHaveCount(5);
    const words = [LAYOUT.guides, HELP.explain, HELP.glossary, LAYOUT.howTitle, LAYOUT.explore];
    for (const [i, word] of words.entries()) await expect(items.nth(i)).toContainText(word);
    await expect(items.nth(4)).toHaveAttribute("href", "/explore");
  }
  await page.getByRole("link", { name: LAYOUT.explore }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(EXPLORE.title);
  await expect(page.locator("figure[data-part]")).toHaveCount(PARTS.length);

  // Method details link to the page too, under the rules.
  await page.goto("/screening?analyst=1");
  await waitForMap(page);
  await expect(page.locator("[data-region=method-explore-link]").filter({ visible: true })).toHaveAttribute(
    "href",
    "/explore"
  );
});

test("a keyboard reaches the picker and every chart's numbers, and a screen reader hears each chart's words", async ({
  page,
}) => {
  const school = listedOf("default")[0].school;
  await openExplore(page, `?school=${school.school_key}`);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: EXPLORE.skip });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#charts")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(EXPLORE.pick.label)).toBeFocused();

  for (const key of PARTS) {
    const figure = figureOf(page, key);
    const title = EXPLORE.parts[key].title;
    await page.keyboard.press("Tab");
    const button = figure.getByRole("button", { name: EXPLORE.table.show });
    await expect(button, key).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(figure.getByRole("button", { name: EXPLORE.table.hide })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const table = page.getByRole("table", { name: title });
    await expect(table, key).toBeVisible();
    await expect(table.getByRole("rowheader").first(), key).toBeVisible();
    // The figure is named for its part; its drawing is hidden, and its words carry what the drawing shows.
    await expect(page.getByRole("figure", { name: title }), key).toBeVisible();
    await expect(figure.locator("svg"), key).toHaveAttribute("aria-hidden", "true");
    await expect(figure.locator("[data-region=most]"), key).toHaveText(/ in the list /);
    await expect(figure.locator("[data-region=marked-lines]"), key).toContainText(school.source_school_name);
    await expect(table.locator("tr[data-marked]"), key).toHaveCount(1);
  }
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`fits a ${size.width} px phone with a school marked and every table open`, async ({ page }) => {
    await page.setViewportSize(size);
    await openExplore(page, `?school=${listedOf("default")[4].school.school_key}`);
    for (const key of PARTS) await tableOf(figureOf(page, key));
    const sideways = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(sideways).toBeLessThanOrEqual(0);
    for (const key of PARTS) {
      const figure = figureOf(page, key);
      const card = (await figure.boundingBox())!;
      const inside = (box: { x: number; y: number; width: number; height: number }) =>
        box.x >= card.x - 0.5 && box.x + box.width <= card.x + card.width + 0.5;
      for (const box of await figure.locator("svg circle").evaluateAll((cs) =>
        cs.map((c) => {
          const r = c.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })
      ))
        expect(inside(box), key).toBe(true);
      const labels = await figure.locator("[aria-hidden=true] > span").evaluateAll((spans) =>
        spans
          .filter((s) => getComputedStyle(s).display !== "none")
          .map((s) => {
            const range = document.createRange();
            range.selectNodeContents(s);
            const r = range.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
      );
      expect(labels.length, key).toBeGreaterThan(1);
      for (const [i, box] of labels.entries()) {
        expect(inside(box), `${key} label ${i}`).toBe(true);
        // Labels in a row never cover one another.
        if (i > 0)
          expect(box.x, `${key} label ${i}`).toBeGreaterThanOrEqual(labels[i - 1].x + labels[i - 1].width);
      }
    }
  });

test("says when there is no data, and recovers from a failed read", async ({ page, context, problems }) => {
  await useMockDataset(context, "empty");
  await page.goto("/explore");
  await expect(page.getByText(LAYOUT.emptyData)).toBeVisible({ timeout: 30_000 });
  problems.length = 0;

  await useMockDataset(context, "default", { results: 503 });
  await page.goto("/explore");
  // Next.js keeps its own empty alert region for route changes, so the page's alert is found by its words.
  await expect(page.getByRole("alert").filter({ hasText: LAYOUT.loadFailed })).toBeVisible({
    timeout: 30_000,
  });
  problems.length = 0;
  await context.addCookies([{ name: "mock-screening-fail", value: "", url: APP_ORIGIN }]);
  await page.getByRole("button", { name: LAYOUT.retry }).click();
  await expect(page.locator("figure[data-part]")).toHaveCount(PARTS.length);
});
