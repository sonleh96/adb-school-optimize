/**
 * Printing the list. Failure modes and the test for each:
 *  1. A printout holds one window of the list (the scrolling column clipped to a page), not every school
 *                                                                                    -> "a printout holds every school..."
 *  2. A printout ignores the filter on screen, or does not say one is on               -> "a printout holds only..."
 *  3. A printout does not say which method, which day or which data it shows, or drops the caveat
 *                                                                                    -> "a printout holds every school..."
 *  4. The controls, the tabs and the map print over the list                          -> "a printout holds every school..."
 *  5. Printing the records to verify prints the ordered list instead                  -> "on the records to verify..."
 */
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import { MAIN_RULE, ORDERED_COUNT, expect, openWorkspace, rowsOf, tab, test } from "./screening-helpers";

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: 60_000 });

const printout = (page: Page) => page.locator("[data-region=print]");
const printed = (page: Page) => printout(page).locator("tbody tr");
const today = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const CAVEAT =
  "This tool suggests which schools to look at first. It does not show a school's real condition or safety, whether repairs would help, or how to spend money.";

test("a printout holds every school in the list, says what it is, and leaves the controls and the map out", async ({
  page,
}, info) => {
  await openWorkspace(page);
  await expect(printout(page)).toBeHidden();
  await page.emulateMedia({ media: "print" });

  await expect(printout(page)).toBeVisible();
  await expect(printed(page)).toHaveCount(ORDERED_COUNT);
  await expect(printout(page).locator("th")).toHaveText(["Rank", "School", "Province", "District", "Why"]);
  await expect(printout(page).locator("h2")).toHaveText("RISE-PNG: Which secondary schools to look at first");
  await expect(printout(page).locator("p")).toHaveText([
    `Schools to look at first under the main method (Combined factors, without urgency), made on ${today()} from data version synthetic-fixture-v1.`,
    CAVEAT,
  ]);
  await expect(printed(page).first().locator("td")).toHaveText([
    "1st",
    "Sample School 08",
    "South Province",
    "South One",
    /\S/,
  ]);
  for (const hidden of [
    "[data-testid=screening-map]",
    "[role=tablist]",
    "[data-region=find]",
    "[data-region=actions]",
  ])
    await expect(page.locator(hidden).first(), hidden).toBeHidden();
  // The list flows from page to page: nothing above it holds it to the window.
  const clipped = await printout(page).evaluate((element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflow !== "visible" || style.position === "absolute" || style.position === "fixed")
        return `${node.tagName}.${node.className}: ${style.position} ${style.overflow}`;
    }
    return null;
  });
  expect(clipped).toBeNull();

  // The PDF a browser makes: every page of it, kept with the test's results.
  const pdf = await page.pdf({ format: "A4", path: info.outputPath("list.pdf") });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(readFileSync(info.outputPath("list.pdf")).length).toBeGreaterThan(1000);
});

test("a printout holds only the schools the filter leaves, and says so", async ({ page }) => {
  const south = rowsOf(MAIN_RULE).filter(
    (r) =>
      r.cohort !== "verification_queue" &&
      (r.school as unknown as { province: string }).province === "South Province"
  );
  await openWorkspace(page, "?prov=South+Province");
  await page.emulateMedia({ media: "print" });
  await expect(printed(page)).toHaveCount(south.length);
  await expect(printout(page).locator("p").nth(1)).toHaveText(
    `${south.length} of the ${ORDERED_COUNT} schools in the list are in South Province.`
  );
  for (const province of await printed(page).locator("td:nth-child(3)").allTextContents())
    expect(province).toBe("South Province");
});

test("on the records to verify, a printout holds the records to verify", async ({ page }) => {
  const queued = rowsOf(MAIN_RULE).filter((r) => r.cohort === "verification_queue");
  await openWorkspace(page);
  await tab(page, /Records to verify/).click();
  await page.emulateMedia({ media: "print" });
  await expect(printout(page).locator("h2")).toHaveText(`RISE-PNG: Records to verify (${queued.length})`);
  await expect(printout(page).locator("th")).toHaveText(["School", "Province", "District", "What to verify"]);
  await expect(printed(page)).toHaveCount(queued.length);
  await expect(printout(page).locator("p").nth(1)).toHaveText(
    "2 have a detail missing. 1 needs checking for another reason, which its entry names."
  );
});
