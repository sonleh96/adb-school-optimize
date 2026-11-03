/**
 * Sign out in the workspace. Failure modes and the test for each:
 *  1. The action shows when sign-in is off, so a contributor or a test run is offered a sign-out of nothing; or, with
 *     sign-in off, the page still asks /auth/token and /auth/user, so its first reads wait a round trip for an answer
 *     that is always "not required"                                    -> "is absent when sign-in is not required..."
 *  2. The action is there but does not end the session or leave the page (the form does not post to /auth/sign-out)
 *     -> "posts to /auth/sign-out and lands on the sign-in page"
 *  3. A mouse can reach it and a keyboard cannot
 *     -> "is reached and used with the keyboard, after the export button"
 *  4. The narrow layout hides Copy link in the Menu and forgets Sign out there
 *     -> "is in the Menu in the narrow layout"
 *  5. Sign out takes the button ink the other actions use instead of its quieter ink, so it competes with Copy link,
 *     or the quieter ink falls under 4.5:1 on the map behind it  -> "reads quieter than the other actions..."
 *  6. The narrow Menu lists its choices in another order than the specification's ("Responsive layout"), mixes in the
 *     kinds of help that Help holds, or Sign out is not last                                                -> "is last in the Menu..."
 * The mock app has no sign-in, so the tests that need a signed-in person answer `/auth/user` as the real route
 * does when sign-in is required, and clear the cookie that says sign-in is off, as the proxy does when sign-in is
 * required; `/auth/sign-out` is the app's own route.
 */
import type { Page } from "@playwright/test";

import { contrastRatio } from "../lib/screening/contrast";
import { LAYOUT } from "../lib/screening/copy";
import { LAND_COLOUR, WATER_COLOUR } from "../lib/screening/marks";
import { expect, openWorkspace, test } from "./screening-helpers";

/** As on a server with sign-in required, whose proxy clears the cookie before the page's script reads it. */
const signInRequired = (page: Page, email: string | null) =>
  Promise.all([
    page.addInitScript(() => {
      document.cookie = "rise-sign-in=; path=/; max-age=0";
    }),
    page.route("**/auth/user", (route) => route.fulfill({ json: { required: true, email } })),
  ]);
const signedIn = (page: Page) => signInRequired(page, "analyst@example.org");
const signOut = (page: Page) => page.getByRole("button", { name: LAYOUT.signOut, exact: true });
const sentToSignIn = async (page: Page) => {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to see the school screening" })).toBeVisible();
};

test("is absent when sign-in is not required, and the page asks nothing about sign-in", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/auth/")) asked.push(request.url());
  });
  await openWorkspace(page);
  await expect(page.getByRole("button", { name: LAYOUT.copyLink })).toBeVisible();
  await expect(signOut(page)).toHaveCount(0);
  expect(asked).toEqual([]);
});

test("is absent when sign-in is required and nobody is signed in", async ({ page }) => {
  await signInRequired(page, null);
  const answered = page.waitForResponse("**/auth/user");
  await openWorkspace(page);
  await answered;
  await expect(signOut(page)).toHaveCount(0);
});

test("posts to /auth/sign-out and lands on the sign-in page", async ({ page }) => {
  await signedIn(page);
  await openWorkspace(page);
  const posted = page.waitForRequest((request) => request.url().endsWith("/auth/sign-out"));
  await signOut(page).click();
  expect((await posted).method()).toBe("POST");
  await sentToSignIn(page);
});

test("is reached and used with the keyboard, after the export button", async ({ page }) => {
  await signedIn(page);
  await openWorkspace(page);
  await expect(signOut(page)).toBeVisible();
  // The actions read: Show method details, Copy link, the export button, then Sign out last.
  await page.getByRole("button", { name: LAYOUT.copyLink }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-region=export-button]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(signOut(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await sentToSignIn(page);
});

test("reads quieter than the other actions, at 4.5:1 or more on the map behind it", async ({ page }) => {
  await signedIn(page);
  await openWorkspace(page);
  await expect(signOut(page)).toBeVisible();
  const hex = (rgb: string) =>
    "#" +
    (rgb.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((v) => Number(v).toString(16).padStart(2, "0"))
      .join("");
  const look = await signOut(page).evaluate((button) => {
    const style = getComputedStyle(button);
    return { color: style.color, weight: style.fontWeight, background: style.backgroundColor };
  });
  // The second ink (#3d4759), not the button ink (#111a2c) the other actions use, at the weight the action sets.
  expect(hex(look.color)).toBe("#3d4759");
  expect(look.weight).toBe("500");
  // It has no fill of its own, so the map shows behind it: land or water.
  expect(look.background).toBe("rgba(0, 0, 0, 0)");
  for (const map of [LAND_COLOUR, WATER_COLOUR])
    expect(contrastRatio(hex(look.color), map)).toBeGreaterThanOrEqual(4.5);
});

test.describe("in the narrow layout", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("is in the Menu in the narrow layout", async ({ page }) => {
    await signedIn(page);
    await openWorkspace(page);
    await expect(signOut(page)).toHaveCount(0);
    await page.getByRole("button", { name: LAYOUT.menu, exact: true }).click();
    await expect(signOut(page)).toBeVisible();
    await signOut(page).click();
    await sentToSignIn(page);
  });

  test("is last in the Menu, which lists its choices in the specification's order", async ({ page }) => {
    await signedIn(page);
    await openWorkspace(page);
    await page.getByRole("button", { name: LAYOUT.menu, exact: true }).click();
    const menu = page.getByRole("group", { name: LAYOUT.menu });
    await expect(menu.getByRole("button", { name: LAYOUT.signOut, exact: true })).toBeVisible();
    // The kinds of help are under Help, beside it; the Menu holds the workspace's own actions.
    expect((await menu.getByRole("button").allTextContents()).map((text) => text.trim())).toEqual([
      "For researchers: show method details",
      "Copy link",
      "Download or print the list",
      "Sign out",
    ]);
  });
});
