/**
 * The keyboard's way to the list, and a window too short for a fixed top bar. Failure modes and the test for each:
 *  1. The first school sits behind the map, its zoom buttons, its credits and the guides: many Tab stops away
 *                                                                            -> "the first Tab offers Skip to the list..."
 *  2. At 400 percent zoom the fixed top bar and the List / Map switch keep 100 of the window's 256 px while the list
 *     scrolls under them                                                     -> "on a window this short..."
 *  3. A card opened on a short window opens out of sight, under a top bar scrolled away
 *                                                                            -> "on a window this short..."
 */
import { ORDERED, expect, openWorkspace, test } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test(`the first Tab offers Skip to the list, which lands on the first school, at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await openWorkspace(page);
      const skip = page.getByRole("link", { name: "Skip to the list" });
      await expect(skip).not.toBeInViewport();
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.locator(`${ORDERED} button`).first()).toBeFocused();
      await expect(page.locator(`${ORDERED} button`).first()).toBeInViewport();
    });
  });
}

test.describe("at 400 percent zoom (1280 by 1024 seen as 320 by 256)", () => {
  test.use({ viewport: { width: 320, height: 256 } });

  test("on a window this short the top bar scrolls away with the list, and a card still opens in view", async ({
    page,
  }) => {
    await openWorkspace(page);
    const bar = page.locator("header[class*=topBar]");
    const switcher = page.locator("[data-region=pane-switch]");
    await expect(bar).toBeInViewport();

    // Scrolling the list takes the bar and the switch with it.
    await page.mouse.move(160, 200);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => (await bar.boundingBox())!.y + (await bar.boundingBox())!.height)
      .toBeLessThanOrEqual(0);
    await expect(switcher).not.toBeInViewport();

    // A school chosen from far down the list opens its card where it can be read, with its way out.
    const row = page.locator(`${ORDERED} button`).nth(3);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const card = page.locator("[data-slot=school-card]");
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Close" }).first()).toBeInViewport();
    await expect(bar).toBeInViewport();
  });
});
