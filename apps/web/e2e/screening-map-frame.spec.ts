/**
 * What the map frames and keeps in view. Failure modes and the test for each:
 *  1. A map the user has panned snaps back to the selection when nothing about the selection changed
 *     -> "a panned map stays where the user left it"
 */
import type { Page } from "@playwright/test";

import { expect, keyOf, markAt, orderedRow, settledMark, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 90_000 });

/** Waits until the map and every panel have stopped moving. */
async function settled(page: Page) {
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
}

test.describe("at 1600 by 1000", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("a panned map stays where the user left it when a key is pressed", async ({ page }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const key = keyOf("additive_u", "Sample School 08");
    await orderedRow(page, "Sample School 08").click();
    await settledMark(page, key);
    await settled(page);

    // Drag the map, inside its clear part, so the selected mark goes under the column.
    const start = (await markAt(page, key))!;
    await page.mouse.move(1150, 400);
    await page.mouse.down();
    await page.mouse.move(650, 400, { steps: 12 });
    await page.mouse.up();
    await settled(page);
    const dragged = (await markAt(page, key))!;
    expect(start.x - dragged.x).toBeGreaterThan(300);

    // A key press elsewhere on the page changes nothing about the selection, so the map stays put.
    await page.locator("canvas.maplibregl-canvas").focus();
    await page.keyboard.press("x");
    await page.waitForTimeout(500);
    await settled(page);
    const after = (await markAt(page, key))!;
    expect(Math.abs(after.x - dragged.x)).toBeLessThan(1);
    expect(Math.abs(after.y - dragged.y)).toBeLessThan(1);
  });
});
