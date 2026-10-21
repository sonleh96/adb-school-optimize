/**
 * The sign-in page says each thing in the copy system's words. Failure modes: an error code shows nothing or the
 * wrong sentence; an `error` that is not one of the four (a word every object has, such as `constructor`) breaks the
 * page or shows a sentence; the note after sending, or the hint when sign-in is unavailable, is missing.
 */
import { expect, test } from "@playwright/test";

import { SIGN_IN } from "../lib/screening/copy/sign-in";

for (const [code, text] of Object.entries(SIGN_IN.errors)) {
  test(`the ${code} error says what happened and what to do`, async ({ page }) => {
    await page.goto(`/sign-in?error=${code}`);
    await expect(page.locator("p[role=alert]")).toHaveText(text);
  });
}

for (const code of ["nothing", "constructor", "__proto__", "toString"]) {
  test(`an error of ${code} shows no sentence and leaves the page whole`, async ({ page }) => {
    await page.goto(`/sign-in?error=${code}`);
    await expect(page.getByRole("heading", { name: SIGN_IN.title })).toBeVisible();
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
  });
}

test("the page words its lead, its field, its button, the note after sending and the hint", async ({
  page,
}) => {
  await page.goto("/sign-in?sent=1");
  await expect(page.getByText(SIGN_IN.lead)).toBeVisible();
  await expect(page.getByLabel(SIGN_IN.emailLabel)).toBeDisabled();
  await expect(page.getByRole("button", { name: SIGN_IN.button })).toBeDisabled();
  await expect(page.locator("p[role=status]")).toHaveText(SIGN_IN.sent);
  // The browser tests run without sign-in set up.
  await expect(page.getByText(SIGN_IN.unavailable)).toBeVisible();
});
