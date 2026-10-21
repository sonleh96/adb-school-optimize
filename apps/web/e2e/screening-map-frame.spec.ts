/**
 * What the map frames and keeps in view. Failure modes and the test for each:
 *  1. A numbered mark, or the selected school's mark, sits under the key or the caveat, because the map keeps less
 *     room at its foot than they take                                   -> "no numbered or selected mark..."
 *  2. A map the user has panned snaps back to the selection when nothing about the selection changed
 *     -> "a panned map stays where the user left it"
 */
import type { Page } from "@playwright/test";

import {
  expect,
  keyOf,
  markAt,
  numberedPlaces,
  orderedRow,
  rowsOf,
  settledMark,
  test,
  waitForMap,
} from "./screening-helpers";

test.describe.configure({ timeout: 90_000 });

/** A mark's largest radius plus its ring, so a mark that only touches the key counts as under it. */
const MARK_REACH = 10;

/** The marks of `keys` that sit under the key or the caveat, with what covers them. */
async function coveredMarks(page: Page, keys: readonly string[]) {
  return page.evaluate(
    ({ keys, reach }) => {
      const covers = ["[data-slot=legend]", "[data-region=caveat]"]
        .map((selector) => document.querySelector(selector))
        .filter((el): el is Element => el !== null)
        .map((el) => ({ name: el.getAttribute("data-slot") ?? "caveat", box: el.getBoundingClientRect() }));
      return keys.flatMap((key) => {
        const point = window.__screeningMapTest?.project(key as never);
        if (!point) return [];
        return covers
          .filter(
            ({ box }) =>
              point.x + reach > box.left &&
              point.x - reach < box.right &&
              point.y + reach > box.top &&
              point.y - reach < box.bottom
          )
          .map(({ name }) => `${key} under the ${name}`);
      });
    },
    { keys: [...keys], reach: MARK_REACH }
  );
}

/** Waits until the map and every panel have stopped moving. */
async function settled(page: Page) {
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("screening-map")).toHaveAttribute("data-map-moving", "false");
}

const FIRST = rowsOf("additive_u").find((r) => r.point_rank?.rank === 1)!.school;

for (const size of [
  { width: 1600, height: 1000 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
]) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`no numbered or selected mark sits under the key or the caveat at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.goto("/screening");
      await waitForMap(page);
      await settled(page);
      const numbered = numberedPlaces("additive_u").map((p) => p.key);
      expect(await coveredMarks(page, numbered)).toEqual([]);

      // The selected school is brought clear of the key too, once its card is open and the key has settled.
      await orderedRow(page, FIRST.source_school_name).click();
      await settledMark(page, FIRST.school_key);
      await settled(page);
      expect(await coveredMarks(page, [FIRST.school_key])).toEqual([]);
    });
  });
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
