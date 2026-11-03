/**
 * Download or print the list. Failure modes and the test for each:
 *  1. The plain download is not the list on screen: other columns than rank, school, province, district and Why, a
 *     Why other than the screen's, a school missing, or no line naming the method, the date and the data version
 *                                                                                      -> "the plain sheet downloads..."
 *  1a. The plain download ignores the find control's filter                              -> "the plain download follows..."
 *  1b. The research file is gone, or is not the API's file byte for byte, or ignores the province on screen
 *                                                                                      -> "the research file..."
 *  1c. A failed research file leaves the sheet with no way on, or stops the plain download -> "a failed research file..."
 *  2. The method sheet's length does not change the list or the link                    -> "the length..."
 *  3. Copy the method record copies something other than the file's record                    -> "Copy the method record..."
 *  4. Escape closes the card behind the sheet, or the sheet traps the screen after closing    -> "Escape closes..."
 *  5. The plain sheet shows method words (an id, a formula, a fingerprint); the method sheet loses them
 *                                                                                              -> "the plain sheet..."
 *  6. A long name pushes the table past the sheet, or a number wraps (R3)                      -> "the tables keep..."
 *  7. The button works before the schools are on screen, or a failed read leaves an empty sheet with no way on
 *                                                                                              -> "with no schools...", "a failed read..."
 *  8. The file ignores the province filter on screen and the sheet says no filter is set; a filter the file cannot
 *     follow (remoteness) goes unmentioned                                                    -> "the method sheet follows..."
 *  9. The plain sheet copies or names its file in method words (a rule id, a hash, a formula)  -> "the plain sheet copies..."
 * 10. The sheet's code fails to load and the button does nothing, with no way on               -> "a failed load of the sheet..."
 * 11. A record says its source's label twice ("Source: Source: ...")                           -> "the plain sheet copies..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { csvRows } from "../lib/screening/method/top-csv";

import {
  MAIN_RULE,
  ORDERED,
  ORDERED_COUNT,
  expect,
  openWorkspace,
  orderedRow,
  rowsOf,
  test,
  useMockDataset,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const file = (name: string) => readFileSync(path.join(FIXTURES, name));
const lines = (name: string) => file(name).toString("utf8").replace(/^﻿/, "").split("\n");
const listed = (name: string) => {
  const match = /point=(\d+), range=(\d+)/.exec(lines(name).find((l) => l.includes("rows_listed"))!)!;
  return { point: Number(match[1]), range: Number(match[2]) };
};

const sheet = (page: Page) => page.getByRole("dialog");
const openSheet = async (page: Page) => {
  await page.getByRole("button", { name: "Download or print the list" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
};
/** The day as the copy writes it, worked out here rather than by the code under test. */
const today = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** The plain download, read as its cells: the lines about the list, the column heads, then one line per school. */
const downloadedList = async (page: Page) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the list" }).click(),
  ]);
  const text = readFileSync((await download.path())!, "utf8");
  return { name: download.suggestedFilename(), text, rows: csvRows(text) };
};
const CAVEAT =
  "This tool suggests which schools to look at first. It does not show a school's real condition or safety, whether repairs would help, or how to spend money.";
const search = (page: Page) => new URL(page.url()).search;
/** A link that opens with the sheet: the sheet is modal, so the page behind it is waited for by its map. */
const openWithSheet = async (page: Page, link: string) => {
  await page.goto(`/screening${link}`);
  await waitForMap(page);
};

/** The source row of a record, said once: its label, then the paper. */
const SOURCE_VALUE =
  'The revised research paper "Comparing school inspection screening approaches under incomplete evidence in Papua New Guinea", which makes the rule without urgency its main rule.';
const SOURCE_LINE = `Source: ${SOURCE_VALUE}`;

test("the plain sheet downloads the list on screen as a spreadsheet a director can read", async ({
  page,
}) => {
  await openWorkspace(page);
  // The rows and their Why lines as the screen shows them, to hold the file to.
  const onScreen = await page.locator(`${ORDERED} button[data-school-key]`).evaluateAll((buttons) =>
    buttons.map((b) => ({
      place: b.querySelector("[data-place]")!.textContent!,
      name: b.querySelector("span[class*=name]")!.textContent!,
      why: b.querySelector("[data-region=row-why]")!.textContent!.replace(/^Why /, ""),
    }))
  );
  await openSheet(page);
  await expect(sheet(page).getByRole("heading")).toHaveText("Download or print the list");
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(10);
  await expect(sheet(page).locator("[data-region=export-more]")).toHaveText(
    `And ${ORDERED_COUNT - 10} more in the file.`
  );
  expect(search(page)).toBe("?panel=export");

  const got = await downloadedList(page);
  expect(got.name).toBe(`rise-png-list-combined-factors-without-urgency-${isoToday()}.csv`);
  expect(got.text.charCodeAt(0)).toBe(0xfeff);
  expect(got.rows[0]).toEqual([
    `Schools to look at first under the main method (Combined factors, without urgency), made on ${today()} from data version synthetic-fixture-v1.`,
  ]);
  expect(got.rows[1]).toEqual([CAVEAT]);
  expect(got.rows[2]).toEqual(["Rank", "School", "Province", "District", "Why"]);
  const body = got.rows.slice(3).filter((r) => r.length > 1);
  expect(body).toHaveLength(ORDERED_COUNT);
  // The screen sets "to" and "of" in a rank apart, so the two are compared without their spaces.
  const bare = (text: string) => text.replace(/\s+/g, "");
  expect(body.map((r) => [bare(r[0]), r[1], r[4]])).toEqual(
    onScreen.map((s) => [bare(s.place), s.name, s.why])
  );
  expect(body[0]).toEqual(["1st", "Sample School 08", "South Province", "South One", onScreen[0].why]);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded the list" })).toHaveText(
    "Downloaded the list. Its first line names the method, the date and the data version."
  );
});

test("the plain download follows the province, district and name on screen", async ({ page }) => {
  const southOne = rowsOf(MAIN_RULE).filter(
    (r) =>
      r.cohort !== "verification_queue" &&
      (r.school as unknown as { district: string }).district === "South One"
  );
  await openWithSheet(page, "?prov=South+Province&dist=South+One&panel=export");
  const status = `${southOne.length} of the ${ORDERED_COUNT} schools in the list are in South One, South Province.`;
  await expect(sheet(page).locator("[data-region=export-find]")).toHaveText(status);
  const got = await downloadedList(page);
  expect(got.name).toBe(`rise-png-list-south-one-combined-factors-without-urgency-${isoToday()}.csv`);
  expect(got.rows[1]).toEqual([status]);
  const body = got.rows.slice(4).filter((r) => r.length > 1);
  expect(body.map((r) => r[1]).sort()).toEqual(southOne.map((r) => r.school.source_school_name).sort());
  expect(body.every((r) => r[2] === "South Province" && r[3] === "South One")).toBe(true);
});

test("the research file is the API's own, byte for byte, for the province on screen", async ({ page }) => {
  await openWithSheet(page, "?panel=export");
  const research = sheet(page).locator("[data-region=research]");
  await expect(research).toContainText("The research team's file of the first 20 schools");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    research.getByRole("button", { name: "Download the research file" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rise_png_screening_top20_additive_no_u.csv");
  expect(readFileSync((await download.path())!).equals(file("exports/top_additive_no_u_20.csv"))).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded the research file" })).toHaveText(
    "Downloaded the research file. The method record is in the first lines of the file."
  );

  await openWithSheet(page, "?prov=South+Province&panel=export");
  const [south] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the research file" }).click(),
  ]);
  expect(readFileSync((await south.path())!).equals(file("exports/top_additive_no_u_20_south.csv"))).toBe(
    true
  );
});

test("a failed research file says so and offers Retry, and the list still downloads", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { exports: 503 });
  await openWithSheet(page, "?panel=export");
  await sheet(page).getByRole("button", { name: "Download the research file" }).click();
  const failure = sheet(page).locator("[data-region=research]").getByRole("alert");
  await expect(failure).toHaveText("The research file did not download. Retry");
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();
  const got = await downloadedList(page);
  expect(got.rows.slice(3).filter((r) => r.length > 1)).toHaveLength(ORDERED_COUNT);
  // The read was refused on purpose, and tried once more; those refusals are the only problems.
  expect(problems.every((p) => p.includes("exports/top.csv") || p.includes("503"))).toBe(true);
  problems.length = 0;
});

test("the method sheet's length changes the list, the file and the link", async ({ page }) => {
  await openWithSheet(page, "?analyst=1&panel=export");
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(
    listed("exports/top_additive_no_u_20.csv").point
  );
  await sheet(page).getByRole("button", { name: "10", exact: true }).click();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(10);
  await expect(sheet(page).getByRole("heading")).toHaveText("First 10, Combined, no urgency");
  expect(search(page)).toBe("?analyst=1&panel=export&n=10");
});

test("Copy the method record in the method sheet copies the file's own record", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWithSheet(page, "?panel=export&analyst=1");
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Method record copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const record = lines("exports/top_additive_no_u_20.csv")
    .filter((l) => l.startsWith('"# '))
    .map((l) => l.slice(3, -1).replace(/""/g, '"').replace(/: ?/, ": "));
  expect(copied.split("\n")).toEqual(record);
});

test("Escape closes the sheet first, then the card behind it", async ({ page }) => {
  await openWorkspace(page);
  await orderedRow(page, "Sample School 08").click();
  await expect(page.locator("[data-slot=school-card]")).toBeVisible();
  await openSheet(page);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator("[data-slot=school-card]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download or print the list" })).toBeFocused();
  expect(search(page)).not.toContain("panel");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=school-card]")).toHaveCount(0);
});

test("the plain sheet keeps method words out, and the method sheet keeps the formula, the id and the fingerprints", async ({
  page,
}) => {
  await openWithSheet(page, "?panel=export");
  const plain = await sheet(page).innerText();
  for (const word of ["additive_no_u", "additive_u", "sha256", "×", "Formula", "S0 = "])
    expect(plain, `plain sheet shows "${word}"`).not.toContain(word);

  await page.goto("/screening?panel=export&analyst=1");
  await waitForMap(page);
  await expect(sheet(page).getByRole("heading")).toHaveText("First 20, Combined, no urgency");
  const record = sheet(page).locator("[data-region=method-record]");
  await expect(record).toContainText("additive_no_u");
  await expect(record).toContainText(
    "S0 = (0.60N + 0.15A + 0.05(R + Q + E + L)) / 0.95 = (12N + 3A + R + Q + E + L) / 19"
  );
  await expect(record).toContainText("input_sha256");
});

test("the tables keep the sheet's width with the longest names, and numbers stay on one line (R3)", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "worst-names");
  for (const link of ["?panel=export", "?panel=export&analyst=1"]) {
    await page.goto(`/screening${link}`);
    await waitForMap(page);
    await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
    const overflow = await sheet(page).evaluate((element) => {
      const width = element.clientWidth;
      const tables = [...element.querySelectorAll("table")].map((t) => t.getBoundingClientRect().width);
      const cells = [...element.querySelectorAll("td")].filter((td) => td.scrollWidth > td.clientWidth + 1);
      // A number on one line has one line box, however tall its row grows beside a long name or a Why line.
      const wrapped = [...element.querySelectorAll("td[class*=num]")].filter((td) => {
        if (!td.textContent) return false;
        const range = document.createRange();
        range.selectNodeContents(td);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1;
      });
      return { width, tables, cells: cells.length, wrapped: wrapped.length };
    });
    for (const w of overflow.tables) expect(w).toBeLessThanOrEqual(overflow.width);
    expect(overflow.cells, `${link}: cells that overflow`).toBe(0);
    expect(overflow.wrapped, `${link}: numbers that wrap`).toBe(0);
  }
});

test("with no schools the button waits, and with one school the sheet lists it", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "empty");
  await page.goto("/screening");
  await expect(page.locator("[data-empty]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download or print the list" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Show method details" })).toBeDisabled();
  // The empty store answers 404, as the API does; those answers were expected.
  expect(problems.every((p) => p.includes("404"))).toBe(true);
  problems.length = 0;

  await useMockDataset(context, "one");
  await page.goto("/screening?panel=export");
  await waitForMap(page);
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(1);
});

test("a failed read of the method sheet's file says so and offers Retry", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "default", { exports: 503 });
  await openWithSheet(page, "?analyst=1&panel=export");
  await expect(sheet(page).getByRole("alert")).toContainText(
    "Some of the information did not load, so there is nothing to show until you try again."
  );
  await expect(sheet(page).getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Download the research file" })).toBeDisabled();
  // The read was refused on purpose, and tried once more; those refusals are the only problems.
  expect(problems.length).toBeGreaterThan(0);
  expect(
    problems.every((p) => p.includes("exports/top.csv") || p.includes("503 (Service Unavailable)"))
  ).toBe(true);
  problems.length = 0;
});

test("while the method sheet's file loads the sheet says so, and its table heads its school column", async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/exports\/top\.csv/, async (route) => {
    await held;
    await route.continue();
  });
  await openWithSheet(page, "?analyst=1&panel=export");
  await expect(sheet(page).getByRole("status")).toHaveText("Loading the top list");
  release();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
  await expect(
    sheet(page).locator("[data-region=export-table] thead").getByRole("columnheader", { name: "School" })
  ).toBeVisible();
});

test("while a comparison loads the column says so", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  // The pair the statement already read loads with the list; another pair is read when the column asks.
  await page.route(/\/api\/v1\/screening\/compare\?.*need_first_u/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/screening?analyst=1&mode=compare&rule=need_first_u&compare=additive_u");
  await waitForMap(page);
  await expect(page.getByRole("status").filter({ hasText: "Loading the comparison" })).toBeVisible();
  release();
  await expect(page.locator("[data-region=slope-chart]")).toBeVisible();
});

test("the method sheet follows the province on screen, and says when a filter is not applied to the file", async ({
  page,
}) => {
  await openWithSheet(page, "?analyst=1&prov=South+Province&panel=export");
  const south = lines("exports/top_additive_no_u_20_south.csv").filter((l) => l.startsWith("point,")).length;
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(south);
  await expect(sheet(page).locator("[data-region=export-filters]")).toContainText("Province: South Province");
  await expect(sheet(page).locator("[data-region=export-filters]")).not.toContainText("None.");
  await expect(sheet(page).locator("[data-filter-not-applied]")).toHaveCount(0);

  await page.goto("/screening?analyst=1&loc=Remote&panel=export");
  await waitForMap(page);
  const filters = sheet(page).locator("[data-region=export-filters]");
  await expect(filters).not.toContainText("None.");
  await expect(filters.locator("[data-filter-not-applied]")).toContainText("Remote");
  await expect(sheet(page).locator("[data-region=export-filter-note]")).toHaveText(
    "The file follows the province filter but not the remoteness filter, so it can list schools you do not see here."
  );
});

test("the plain sheet copies its record in plain words, and the method sheet keeps the API's record and name", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWithSheet(page, "?panel=export");
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain("Combined factors, without urgency");
  expect(plain.split("\n").filter((line) => line.includes("Source"))).toEqual([SOURCE_LINE]);
  await expect(
    sheet(page)
      .locator("dt", { hasText: /^Source$/ })
      .locator("+ dd")
  ).toHaveText(SOURCE_VALUE);
  for (const word of ["additive_no_u", "additive_u", "sha256", "formula", "run_id", "S0 = "])
    expect(plain, `plain record carries "${word}"`).not.toContain(word);

  await page.goto("/screening?analyst=1&panel=export");
  await waitForMap(page);
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
  await expect(
    sheet(page)
      .locator("dt", { hasText: /^Source$/ })
      .locator("+ dd")
  ).toHaveText(SOURCE_VALUE);
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("rule_id: additive_no_u");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the research file" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rise_png_screening_top20_additive_no_u.csv");
});

test("a failed load of the sheet's code says so and loads it again on Retry", async ({ context }) => {
  // A page of its own: the refused scripts are this test's subject, not problems of the shared page.
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  // Every script from now on fails, as on a dropped connection, so the sheet's code cannot load.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.getByRole("button", { name: "Download or print the list" }).click();
  const failure = page.getByRole("alert").filter({ hasText: "Some of the information did not load" });
  await expect(failure).toBeVisible();
  await page.unroute("**/_next/static/chunks/**");
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
  // The refused scripts are expected failures; nothing else may go wrong on the page.
  expect(errors).toEqual([]);
  await page.close();
});
