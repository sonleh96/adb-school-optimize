/**
 * Download the top list. Failure modes and the test for each:
 *  1. The sheet shows a list other than the file's, or the download is not the file previewed (the method record
 *     missing, rewritten or re-encoded)                                                       -> "the sheet previews..."
 *  2. The length does not change the list or the link                                         -> "the length..."
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
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, openWorkspace, orderedRow, test, useMockDataset, waitForMap } from "./screening-helpers";

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
  await page.getByRole("button", { name: "Download the top list" }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
};
const search = (page: Page) => new URL(page.url()).search;
/** A link that opens with the sheet: the sheet is modal, so the page behind it is waited for by its map. */
const openWithSheet = async (page: Page, link: string) => {
  await page.goto(`/screening${link}`);
  await waitForMap(page);
};

test("the sheet previews the API's file and downloads that file byte for byte", async ({ page }) => {
  await openWorkspace(page);
  await openSheet(page);
  await expect(sheet(page).getByRole("heading")).toHaveText(
    "Top list: the first 20 under the combined-factors rule with urgency (S)"
  );
  const counts = listed("exports/top_additive_u_20.csv");
  const table = sheet(page).locator("[data-region=export-table] tbody tr");
  await expect(table).toHaveCount(counts.point);
  await expect(table.first()).toHaveText("1stSample School 08 · South Province0.683");
  await expect(sheet(page).locator("table").nth(1).locator("tbody tr")).toHaveCount(counts.range);
  await expect(sheet(page).locator("[data-region=method-record]")).toContainText("Method record");
  expect(search(page)).toBe("?panel=export");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the top list" }).click(),
  ]);
  // The plain sheet names the file in plain words; the bytes are still the API's file.
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(download.suggestedFilename()).not.toMatch(/additive_u|rise_png|_/);
  const saved = readFileSync((await download.path())!);
  expect(saved.equals(file("exports/top_additive_u_20.csv"))).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded the top list" })).toHaveText(
    "Downloaded the top list. The method record is in the first lines of the file."
  );
});

test("the length changes the list, the file and the link", async ({ page }) => {
  await openWithSheet(page, "?panel=export");
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(
    listed("exports/top_additive_u_20.csv").point
  );
  await sheet(page).getByRole("button", { name: "10", exact: true }).click();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(10);
  await expect(sheet(page).getByRole("heading")).toHaveText(
    "Top list: the first 10 under the combined-factors rule with urgency (S)"
  );
  expect(search(page)).toBe("?panel=export&n=10");
});

test("Copy the method record in the method sheet copies the file's own record", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWithSheet(page, "?panel=export&analyst=1");
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Method record copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const record = lines("exports/top_additive_u_20.csv")
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
  await expect(page.getByRole("button", { name: "Download the top list" })).toBeFocused();
  expect(search(page)).not.toContain("panel");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=school-card]")).toHaveCount(0);
});

test("the plain sheet keeps method words out, and the method sheet keeps the formula, the id and the fingerprints", async ({
  page,
}) => {
  await openWithSheet(page, "?panel=export");
  const plain = await sheet(page).innerText();
  for (const word of ["additive_u", "sha256", "×", "Formula", "S = 0.60N"])
    expect(plain, `plain sheet shows "${word}"`).not.toContain(word);
  await expect(sheet(page)).toContainText(
    "2 source files. The downloaded file names each one with its fingerprint."
  );

  await page.goto("/screening?panel=export&analyst=1");
  await waitForMap(page);
  await expect(sheet(page).getByRole("heading")).toHaveText("First 20, Combined");
  const record = sheet(page).locator("[data-region=method-record]");
  await expect(record).toContainText("additive_u");
  await expect(record).toContainText("S = 0.60N + 0.15A + 0.05U + 0.05R + 0.05Q + 0.05E + 0.05L");
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
      // A number on one line has one line box, however tall its row grows beside a long name.
      const wrapped = [...element.querySelectorAll("td:last-child")].filter((td) => {
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
  await expect(page.getByRole("button", { name: "Download the top list" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Show method details" })).toBeDisabled();
  // The empty store answers 404, as the API does; those answers were expected.
  expect(problems.every((p) => p.includes("404"))).toBe(true);
  problems.length = 0;

  await useMockDataset(context, "one");
  await page.goto("/screening?panel=export");
  await waitForMap(page);
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(1);
});

test("a failed read says so in the sheet and offers Retry", async ({ page, context, problems }) => {
  await useMockDataset(context, "default", { exports: 503 });
  await openWithSheet(page, "?panel=export");
  await expect(sheet(page).getByRole("alert")).toContainText(
    "Some of the information did not load, so there is nothing to show until you try again."
  );
  await expect(sheet(page).getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Download the top list" })).toBeDisabled();
  // The read was refused on purpose, and tried once more; those refusals are the only problems.
  expect(problems.length).toBeGreaterThan(0);
  expect(
    problems.every((p) => p.includes("exports/top.csv") || p.includes("503 (Service Unavailable)"))
  ).toBe(true);
  problems.length = 0;
});

test("while the file loads the sheet says so, and the plain table heads its school column", async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/exports\/top\.csv/, async (route) => {
    await held;
    await route.continue();
  });
  await openWithSheet(page, "?panel=export");
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
  const south = lines("exports/top_additive_u_20_south.csv").filter((l) => l.startsWith("point,")).length;
  await expect(sheet(page).locator("[data-region=export-table] tbody tr")).toHaveCount(south);
  await expect(sheet(page).locator("[data-region=export-filters]")).toContainText("Province: South Province");
  await expect(sheet(page).locator("[data-region=export-filters]")).not.toContainText("None.");
  await expect(sheet(page).locator("[data-filter-not-applied]")).toHaveCount(0);

  await page.goto("/screening?analyst=1&loc=Remote&panel=export");
  await waitForMap(page);
  const filters = sheet(page).locator("[data-region=export-filters]");
  await expect(filters).not.toContainText("None.");
  await expect(filters.locator("[data-filter-not-applied]")).toContainText("Remote");
});

test("the plain sheet copies its record in plain words, and the method sheet keeps the API's record and name", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWithSheet(page, "?panel=export");
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain("Combined factors, with urgency");
  for (const word of ["additive_u", "sha256", "formula", "run_id", "S = 0.60N"])
    expect(plain, `plain record carries "${word}"`).not.toContain(word);

  await page.goto("/screening?analyst=1&panel=export");
  await waitForMap(page);
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
  await sheet(page).getByRole("button", { name: "Copy the method record" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("rule_id: additive_u");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the top list" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rise_png_screening_top20_additive_u.csv");
});

test("a failed load of the sheet's code says so and loads it again on Retry", async ({ context }) => {
  // A page of its own: the refused scripts are this test's subject, not problems of the shared page.
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  // Every script from now on fails, as on a dropped connection, so the sheet's code cannot load.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.getByRole("button", { name: "Download the top list" }).click();
  const failure = page.getByRole("alert").filter({ hasText: "Some of the information did not load" });
  await expect(failure).toBeVisible();
  await page.unroute("**/_next/static/chunks/**");
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(sheet(page).locator("[data-region=export-table] tbody tr").first()).toBeVisible();
  // The refused scripts are expected failures; nothing else may go wrong on the page.
  expect(errors).toEqual([]);
  await page.close();
});
