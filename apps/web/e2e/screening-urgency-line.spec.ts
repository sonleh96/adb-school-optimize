/**
 * The urgency question waits behind Change. First-time readers named the link to the earlier method, and the note
 * under it, as the most confusing thing on the first screen. Failure modes and the test for each:
 *  1. The first screen still shows the link to the earlier method, or says anything about urgency
 *                                                                      -> "the first screen leaves the urgency..."
 *  2. Change opens without saying why the main method leaves urgency out, or without the link beside that reason
 *                                                                      -> "the first screen leaves the urgency..."
 *  3. The link beside the statement no longer opens the comparison     -> "the first screen leaves the urgency..."
 */
import { expect, openRules, openWorkspace, test } from "./screening-helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test("the first screen leaves the urgency question to Change, whose statement says why and links to the comparison", async ({
  page,
}) => {
  await openWorkspace(page);
  const area = page.locator("[data-region=rule-identity]");
  await expect(area.getByRole("button", { name: "Change how the list is ordered" })).toBeVisible();
  await expect(page.locator("[data-region=see-with-urgency]")).toHaveCount(0);
  expect(await area.innerText()).not.toMatch(/urgency|trace/i);

  await openRules(page);
  const statement = page.locator("[data-region=list-statement]");
  await expect(statement).toContainText(
    "The urgency rating is left out because where it came from has not been traced"
  );
  const link = statement.getByRole("button", {
    name: "Compare with the earlier method, which also counts an urgency rating",
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator("[data-region=changed-lead]")).toBeVisible();
  expect(new URL(page.url()).search).toBe("?compare=additive_u");
});
