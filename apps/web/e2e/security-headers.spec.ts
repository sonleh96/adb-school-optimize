/**
 * The headers every page is sent with. Failure modes and the test for each:
 *  1. Another site can frame the tool and draw over it, or the page has no content policy at all
 *                                                                       -> "every page is sent..."
 *  2. The full address of a page, with the school a reader opened, goes to other sites as the referrer
 *                                                                       -> "every page is sent..."
 *  3. The server names its framework (X-Powered-By)                     -> "every page is sent..."
 *  4. The policy blocks something the screen needs: its scripts, the map's worker, its tiles or its fonts
 *                                                                       -> "the screen draws its list and map..."
 */
import { expect, test } from "./screening-helpers";

test("every page is sent a content policy that no other site can frame, a referrer policy, and no X-Powered-By", async ({
  request,
}) => {
  for (const path of ["/", "/screening", "/sign-in", "/healthz"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-powered-by"], path).toBeUndefined();
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    const policy = Object.fromEntries(
      (headers["content-security-policy"] ?? "")
        .split(";")
        .map((part) => part.trim().split(/\s+/))
        .filter(([name]) => name)
        .map(([name, ...values]) => [name, values])
    );
    expect(policy["frame-ancestors"], path).toEqual(["'none'"]);
    expect(policy["default-src"], path).toEqual(["'self'"]);
    expect(policy["object-src"], path).toEqual(["'none'"]);
    expect(policy["connect-src"], path).toContain("https://*.cartocdn.com");
    expect(policy["worker-src"], path).toEqual(expect.arrayContaining(["'self'", "blob:"]));
  }
});

test("the screen draws its list and map under the policy, and nothing is refused", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __refused: string[] }).__refused = seen;
    document.addEventListener("securitypolicyviolation", (event) =>
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`)
    );
  });
  await page.goto("/screening");
  await page.evaluate(() => window.__screeningWorkspace?.ready);
  await expect(page.locator("[data-testid=screening-map][data-map-ready=true]")).toHaveCount(1, {
    timeout: 25_000,
  });
  await page.locator("ol[aria-label='The list'] button").first().click();
  await expect(page.locator("[data-slot=school-card]")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __refused: string[] }).__refused)).toEqual([]);
});
