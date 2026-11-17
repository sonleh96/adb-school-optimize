/**
 * The list's rows and the line above them, read at a glance on a phone and a desktop. Failure modes and the test for
 * each:
 *  1. A range school's place stacks into a column whose top line is its best rank alone, so a reader takes "1st" in
 *     the 9th row for a second first place                              -> "a range row's first line says the range..."
 *  2. On a 320 px phone the buttons beside the scope line run into the list's padding
 *                                                                         -> "the buttons over the list fit..."
 */
import type { Page } from "@playwright/test";

import { expect, openWorkspace, test } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

const rangePlaces = (page: Page) =>
  page.locator("[data-region=ranked-list] button[data-cohort=interval] [data-place=range]");

for (const size of SIZES) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size, deviceScaleFactor: 2 });

    test(`a range row's first line says the range, and its place stays inside the row, at ${size.width}`, async ({
      page,
    }) => {
      await openWorkspace(page);
      const places = rangePlaces(page);
      await expect(places.first()).toBeAttached();
      for (const place of await places.all()) {
        await place.scrollIntoViewIfNeeded();
        const firstLine = (await place.innerText()).split("\n")[0].trim();
        expect(firstLine).toMatch(/^\d+(st|nd|rd|th) to \d+(st|nd|rd|th)$/);
        const [p, row] = await Promise.all([
          place.boundingBox(),
          place.locator("xpath=ancestor::button[1]").boundingBox(),
        ]);
        expect(p!.x).toBeGreaterThanOrEqual(row!.x);
        expect(p!.x + p!.width).toBeLessThanOrEqual(row!.x + row!.width);
      }
    });

    test(`the buttons over the list fit inside its padding, at ${size.width}`, async ({ page }) => {
      await openWorkspace(page);
      const head = page.locator("[data-region=scope]");
      const inner = await head.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
      });
      const buttons = head.locator("button:visible:not([aria-controls=screening-scope-detail])");
      expect(await buttons.count()).toBeGreaterThan(0);
      for (const button of await buttons.all()) {
        const box = (await button.boundingBox())!;
        expect(box.x, await button.innerText()).toBeGreaterThanOrEqual(inner.left - 0.5);
        expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(inner.right + 0.5);
      }
    });
  });
}
