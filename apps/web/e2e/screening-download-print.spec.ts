/**
 * Download or print the list, where a first-time reader looks for it. First-time readers saw no way to print on a
 * laptop, and on a phone guessed it might be in Menu. Failure modes and the test for each:
 *  1. The main action does not say it prints, or the sheet's Print sits apart from its download
 *                                                                        -> "the main action says download or print..."
 *  2. A wide screen shows the action twice                                -> "the main action says download or print..."
 *  3. On a phone the action hides in Menu, or showing it pushes the first school out of the window
 *                                                                        -> "on a phone, the head of the list..."
 *  4. Closing the sheet opened from the head of the list leaves focus somewhere else
 *                                                                        -> "on a phone, the head of the list..."
 *  5. Opened over the records not in the list yet, the sheet prints those records while it shows and downloads the
 *     list, or says the list's schools are on screen                     -> "opened over the records..."
 */
import type { Page } from "@playwright/test";

import { ORDERED, ORDERED_COUNT, expect, openWorkspace, tab, test } from "./screening-helpers";

const ACTION = "Download or print the list";
const sheet = (page: Page) => page.getByRole("dialog");
const printout = (page: Page) => page.locator("[data-region=print]");
const listHeadAction = (page: Page) => page.locator("[data-region=list-export]");

test.describe("at 1440 by 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the main action says download or print, and its sheet offers Print beside the download", async ({
    page,
  }) => {
    await openWorkspace(page);
    // The actions above the map hold it on a wide screen, so the head of the list does not repeat it.
    await expect(listHeadAction(page)).toBeHidden();
    await page.getByRole("button", { name: ACTION }).click();
    await expect(sheet(page).getByRole("heading")).toHaveText(ACTION);
    const print = sheet(page).locator("[data-region=print-list]");
    await expect(print).toHaveText("Print the list");
    await expect(print.locator("xpath=following-sibling::button[1]")).toHaveText("Download the list");
  });

  test("opened over the records not in the list yet, the sheet prints the list it shows, and does not say it is on screen", async ({
    page,
  }) => {
    await openWorkspace(page);
    await tab(page, /Not in the list yet/).click();
    await page.getByRole("button", { name: ACTION }).click();
    await expect(sheet(page).locator("#screening-export-lede")).toHaveText(
      `A spreadsheet or a printout of the ${ORDERED_COUNT} schools in the list, in order, with the main reason for each. Its first line names the method, the date and the data version.`
    );
    await page.emulateMedia({ media: "print" });
    await expect(printout(page).locator("h2")).toHaveText(
      "RISE-PNG: Which secondary schools to look at first"
    );
    await expect(printout(page).locator("tbody tr")).toHaveCount(ORDERED_COUNT);
  });
});

test.describe("at 390 by 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("on a phone, the head of the list offers download or print without Menu, and the first school stays in the window", async ({
    page,
  }) => {
    await openWorkspace(page);
    await expect(listHeadAction(page)).toBeVisible();
    await expect(listHeadAction(page)).toHaveText(ACTION);
    await expect(listHeadAction(page)).toBeInViewport({ ratio: 1 });
    const first = page.locator(`${ORDERED} button`).first();
    await expect(first.locator("[data-region=row-why]")).toBeInViewport({ ratio: 1 });

    await listHeadAction(page).click();
    await expect(sheet(page).getByRole("heading")).toHaveText(ACTION);
    await expect(sheet(page).locator("[data-region=print-list]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(listHeadAction(page)).toBeFocused();
  });
});
