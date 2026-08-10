import { expect, test } from "@playwright/test";

test("sign-in route explains the configured boundary", async ({ page }) => {
  await page.goto("/sign-in?error=configuration");

  await expect(page.getByRole("heading", { name: "Sign in to the decision workspace" })).toBeVisible();
  await expect(page.getByText("Authentication is not configured for this deployment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
});

test("Overview interactions do not accumulate map renderers", async ({ page }) => {
  await page.goto("/all-schools");
  await expect(page.getByRole("heading", { name: "Ranked schools" })).toBeVisible();
  await expect(page.getByText("2 schools", { exact: true })).toBeVisible();
  await page.locator(".leaflet-container").waitFor();

  const baseline = await page.locator("canvas").count();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Compare Priority + Need" }).click();
  }
  await page.getByRole("button", { name: "Need", exact: true }).first().click();
  await page.getByRole("button", { name: "Priority", exact: true }).first().click();

  await expect.poll(() => page.locator("canvas").count()).toBeLessThanOrEqual(Math.max(2, baseline + 1));
});

test("District indicator state round-trips through the URL", async ({ page }) => {
  await page.goto("/district-explorer");
  await page.getByLabel("Indicator").selectOption("Conflict Events");

  await expect(page).toHaveURL(/indicator=Conflict(?:\+|%20)Events/);
  await expect(page.getByText("Conflict Events · count")).toBeVisible();
  await expect(page.getByRole("button", { name: "EVERYONE" })).toHaveAttribute("aria-pressed", "true");
});

test("Scenario run and authenticated export complete", async ({ page }) => {
  await page.goto("/scenario-lab");
  await page.getByLabel("Scenario name").fill("CI scenario run");
  await page.getByRole("button", { name: "Run And Save Scenario" }).click();
  await expect(page.getByText(/Saved scenario "CI scenario run"/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Scores", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("research_prototype_scores.xlsx");
});
