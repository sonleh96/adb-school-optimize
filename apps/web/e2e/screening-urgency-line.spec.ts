/**
 * Why urgency is left out, beside its link. Failure modes and the test for each:
 *  1. The reason sits behind "Change how the list is ordered", so a first-time reader meets the link to the earlier
 *     method without it                                                  -> "the first screen says why..."
 *  2. The line stays once the rule area is open, where the full statement says it again, or shows under another rule,
 *     where the link it explains is not there                            -> "the first screen says why..."
 */
import { MAIN_RULE, expect, openRules, openWorkspace, test } from "./screening-helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const WHY = "Nobody could trace how that rating was made, so the main method leaves it out.";

test("the first screen says why the main method leaves urgency out, right under its link", async ({
  page,
}) => {
  await openWorkspace(page);
  const link = page.locator("[data-region=see-with-urgency]");
  const why = page.locator("[data-region=urgency-why]");
  await expect(why).toHaveText(WHY);
  const a = (await link.boundingBox())!;
  const b = (await why.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
  expect(b.y - (a.y + a.height)).toBeLessThan(12);

  // The open rule area's statement says the same at length, so the line goes with the link.
  await openRules(page);
  await expect(why).toHaveCount(0);

  // Under another rule the link is "Back to the paper's main rule", and the line does not follow it.
  await page.goto(`/screening?rule=additive_u`);
  await expect(page.getByRole("button", { name: "Back to the paper's main rule" })).toBeVisible();
  await expect(why).toHaveCount(0);
  expect(MAIN_RULE).toBe("additive_no_u");
});
