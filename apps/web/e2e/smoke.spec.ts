import { expect, test } from "@playwright/test";

test("sign-in route explains the configured boundary", async ({ page }) => {
  await page.goto("/sign-in?error=configuration");

  await expect(page.getByRole("heading", { name: "Sign in to see the school screening" })).toBeVisible();
  await expect(
    page.getByText(
      "Signing in is not set up for this site yet. Ask the project team to finish setting it up."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
});
