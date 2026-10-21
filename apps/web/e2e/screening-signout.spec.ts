/**
 * Sign out in the workspace. Failure modes and the test for each:
 *  1. The action shows when sign-in is off, so a contributor or a test run is offered a sign-out of nothing
 *     -> "is absent when sign-in is not required"
 *  2. The action is there but does not end the session or leave the page (the form does not post to /auth/sign-out)
 *     -> "posts to /auth/sign-out and lands on the sign-in page"
 *  3. A mouse can reach it and a keyboard cannot
 *     -> "is reached and used with the keyboard, next to Copy link"
 *  4. The narrow layout hides Copy link in the Menu and forgets Sign out there
 *     -> "is in the Menu in the narrow layout"
 * The mock app has no sign-in, so the tests that need a signed-in person answer `/auth/user` as the real route
 * does when sign-in is required; `/auth/sign-out` is the app's own route.
 */
import type { Page } from "@playwright/test";

import { LAYOUT } from "../lib/screening/copy";
import { expect, openWorkspace, test } from "./screening-helpers";

const signedIn = (page: Page) =>
  page.route("**/auth/user", (route) =>
    route.fulfill({ json: { required: true, email: "analyst@example.org" } })
  );
const signOut = (page: Page) => page.getByRole("button", { name: LAYOUT.signOut, exact: true });
const sentToSignIn = async (page: Page) => {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to see the school screening" })).toBeVisible();
};

test("is absent when sign-in is not required", async ({ page }) => {
  const answered = page.waitForResponse("**/auth/user");
  await openWorkspace(page);
  expect(await (await answered).json()).toEqual({ required: false, email: null });
  await expect(page.getByRole("button", { name: LAYOUT.copyLink })).toBeVisible();
  await expect(signOut(page)).toHaveCount(0);
});

test("is absent when sign-in is required and nobody is signed in", async ({ page }) => {
  await page.route("**/auth/user", (route) => route.fulfill({ json: { required: true, email: null } }));
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

test("is reached and used with the keyboard, next to Copy link", async ({ page }) => {
  await signedIn(page);
  await openWorkspace(page);
  await expect(signOut(page)).toBeVisible();
  await page.getByRole("button", { name: LAYOUT.copyLink }).focus();
  await page.keyboard.press("Tab");
  await expect(signOut(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await sentToSignIn(page);
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
});
