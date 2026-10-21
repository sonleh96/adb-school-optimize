/**
 * The `next` a sign-in link carries ends up in the sign-in form and then in the callback's redirect. Failure mode:
 * a crafted `next` (a backslash, encoded slashes, a control character) reaches the form unchanged, so the callback
 * would send a signed-in person to another site. The unit tests cover the rule; these go through the real pages.
 * The browser tests run without Supabase, so the callback itself stops before it reads `next`; the check on it
 * only holds that no crafted value makes it answer with an address on another origin.
 */
import { expect, test } from "@playwright/test";

const CRAFTED = [
  "/\\evil.com",
  "/\\/evil.com",
  "//evil.com",
  "/%5Cevil.com",
  "/%2F%2Fevil.com",
  "/\t/evil.com",
];
const nextField = (page: import("@playwright/test").Page) => page.locator("input[name=next]");

for (const value of CRAFTED) {
  test(`the sign-in form does not carry ${JSON.stringify(value)}`, async ({ page }) => {
    await page.goto(`/sign-in?next=${encodeURIComponent(value)}`);
    await expect(nextField(page)).toHaveValue("/");
  });
}

test("the sign-in form keeps a path on this origin", async ({ page }) => {
  await page.goto(`/sign-in?next=${encodeURIComponent("/screening?rule=additive_no_u")}`);
  await expect(nextField(page)).toHaveValue("/screening?rule=additive_no_u");
});

test("the callback never answers with an address on another origin", async ({ request, baseURL }) => {
  for (const value of CRAFTED) {
    const response = await request.get(`/auth/callback?code=x&next=${encodeURIComponent(value)}`, {
      maxRedirects: 0,
    });
    const location = response.headers()["location"];
    // Next builds the address from its own host name, which is `localhost` here, not the one the test used.
    expect(["localhost", "127.0.0.1"]).toContain(new URL(location, baseURL).hostname);
  }
});
