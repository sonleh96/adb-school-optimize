import { expect, test } from "@playwright/test";

test("sign-in route explains the configured boundary", async ({ page }) => {
  await page.goto("/sign-in?error=configuration");

  await expect(page.getByRole("heading", { name: "Sign in to the decision workspace" })).toBeVisible();
  await expect(page.getByText("Authentication is not configured for this deployment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
});
