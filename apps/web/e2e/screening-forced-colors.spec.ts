/**
 * Forced-colours mode (Windows High Contrast and similar). The browser drops box shadows and replaces every
 * background and text colour with the system's, so a two-way switch that marks its chosen side with a ring and a
 * white fill shows two identical sides. Failure mode and the test for it:
 *  1. A switch's chosen side looks the same as the other side  -> one test per switch, below.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, openRules, openWorkspace, test } from "./screening-helpers";

test.use({ colorScheme: "light", contextOptions: { forcedColors: "active" } });
test.describe.configure({ timeout: 60_000 });

/** What the browser still draws round a button in forced colours: its outline. */
const outline = (button: Locator) =>
  button.evaluate((b) => {
    const s = getComputedStyle(b);
    return s.outlineStyle === "none" ? 0 : parseFloat(s.outlineWidth);
  });

async function expectChosenSideMarked(page: Page, group: Locator) {
  await expect(group).toBeVisible();
  // A focus ring is an outline too; measure with nothing focused.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const chosen = group.locator("button[aria-pressed=true]");
  const other = group.locator("button[aria-pressed=false]").first();
  await expect(chosen).toHaveCount(1);
  expect(await outline(chosen)).toBeGreaterThanOrEqual(2);
  expect(await outline(other)).toBe(0);
}

test("the rule switch shows which rule is chosen", async ({ page }) => {
  await openWorkspace(page);
  await openRules(page);
  await expectChosenSideMarked(page, page.locator("[data-region=rule-switch]"));
});

test("the Not in the list yet tab's grouping switch shows which grouping is chosen", async ({ page }) => {
  await openWorkspace(page, "?view=queue");
  await expectChosenSideMarked(page, page.locator("[role=group][aria-labelledby=screening-group-by]"));
});

test("the export sheet's length and kind switches show which side is chosen", async ({ page }) => {
  await openWorkspace(page, "?analyst=1&panel=export");
  const sheet = page.locator("[data-region=export-sheet]");
  await expectChosenSideMarked(page, sheet.locator("[role=group]:has(button[data-region=pack-tab])"));
  await expectChosenSideMarked(page, sheet.locator("[role=group]:not(:has(button[data-region=pack-tab]))"));
});

test("the comparison's top 10 or 20 switch shows which is chosen", async ({ page }) => {
  await openWorkspace(page, "?analyst=1&mode=compare&rule=need_first_u&compare=additive_u");
  await expectChosenSideMarked(page, page.locator("[data-region=slope-chart] [role=group]"));
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the List and Map switch shows which view is chosen", async ({ page }) => {
    await openWorkspace(page);
    await expectChosenSideMarked(page, page.locator("[data-region=pane-switch]"));
  });
});
