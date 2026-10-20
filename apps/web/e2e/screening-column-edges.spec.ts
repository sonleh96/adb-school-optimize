/**
 * The column when a read fails, when the keyboard drives it, when the browser moves through its history and when the
 * rule changes faster than its list loads. Failure modes and the test for each:
 *  1. A URL that holds only defaults or junk is left as it was                -> "a URL that says nothing..."
 *  2. Back and Forward change the URL but not the screen                      -> "Back and Forward..."
 */
import type { Page } from "@playwright/test";

import { ORDERED, ORDERED_COUNT, RULE, expect, mainRule, openWorkspace, test } from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 60_000 });

const REASSURANCE =
  "Among the 16 schools with every input recorded, all 16 schools with every input recorded are in the top 20 with or without the urgency value. Leaving it out changes the order in the list, and the largest move for any school is 2 places. For the five schools that show a range, leaving it out can still move their possible places.";

const changed = (page: Page) => page.locator("[data-region=what-changed]");
const lead = (page: Page) => changed(page).locator("[data-region=changed-lead]");
const search = (page: Page) => new URL(page.url()).search;

test("a URL that says nothing but defaults and junk is tidied, keeping the keys other layers own", async ({
  page,
}) => {
  await openWorkspace(page, "?view=bogus&rule=additive_u&scope=0&qgroup=zzz&guide=q1");
  await expect.poll(() => search(page)).toBe("?guide=q1");
  await expect(page.locator(`${ORDERED} button`)).toHaveCount(ORDERED_COUNT);
});

test("Back and Forward bring back the screen each URL describes", async ({ page }) => {
  await openWorkspace(page);
  await mainRule(page, RULE.proposed).click();
  await expect(lead(page)).toHaveText(REASSURANCE);
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");

  // A jump within the page makes a new history entry; the switch then changes that entry's URL.
  await page.evaluate(() => (window.location.hash = "list"));
  await mainRule(page, RULE.main).click();
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
  expect(search(page)).toBe("?compare=additive_no_u");

  await page.goBack();
  expect(search(page)).toBe("?rule=additive_no_u&compare=additive_u");
  await expect(mainRule(page, RULE.proposed)).toHaveAttribute("aria-pressed", "true");
  await expect(lead(page)).toHaveText(REASSURANCE);

  await page.goForward();
  expect(search(page)).toBe("?compare=additive_no_u");
  await expect(mainRule(page, RULE.main)).toHaveAttribute("aria-pressed", "true");
});
