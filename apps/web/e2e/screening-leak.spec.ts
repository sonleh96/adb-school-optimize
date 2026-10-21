/**
 * Failure mode: leaving /screening and coming back leaves the old map's WebGL context, canvas and memory behind,
 * so a long session slowly fills the browser's context limit and its heap.
 * Counting canvas elements cannot see this (a leaked canvas is detached), so the test asks the browser's heap how
 * many WebGL2 contexts are alive, after a garbage collection, across route round trips.
 */
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ timeout: 90_000 });

async function liveWebGlContexts(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const prototype = await cdp.send("Runtime.evaluate", { expression: "WebGL2RenderingContext.prototype" });
    const found = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId! });
    const length = await cdp.send("Runtime.callFunctionOn", {
      objectId: found.objects.objectId!,
      functionDeclaration: "function () { return this.length; }",
      returnByValue: true,
    });
    return length.result.value as number;
  } finally {
    await cdp.detach();
  }
}

async function openScreening(page: Page) {
  await expect(page.locator("[data-testid=screening-map][data-map-ready=true]")).toHaveCount(1, {
    timeout: 25_000,
  });
}

test("route round trips do not leave WebGL contexts behind", async ({ page }) => {
  await page.goto("/screening");
  await openScreening(page);
  const first = await liveWebGlContexts(page);
  expect(first).toBe(1);

  for (let cycle = 0; cycle < 6; cycle += 1) {
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(/\/all-schools/);
    await expect(page.locator("[data-testid=screening-map]")).toHaveCount(0);
    // The app router's own client-side navigation, so the page is not reloaded.
    await page.evaluate(() =>
      (window as unknown as { next: { router: { push: (p: string) => void } } }).next.router.push(
        "/screening"
      )
    );
    await expect(page).toHaveURL(/\/screening$/);
    await openScreening(page);
  }

  expect(await liveWebGlContexts(page)).toBe(1);
  await expect(page.locator("canvas")).toHaveCount(1);
});
