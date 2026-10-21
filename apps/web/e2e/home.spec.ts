/**
 * Failure modes of the app's address: "/" opens something other than the workspace, or the redirect to the
 * workspace drops the query string, so a shared link opens the default view instead of the one it describes.
 */
import { expect, orderedRow, test, waitForMap } from "./screening-helpers";

test("/ opens the workspace and keeps the link's view", async ({ page }) => {
  await page.goto("/?rule=additive_u");
  await waitForMap(page);

  const url = new URL(page.url());
  expect(url.pathname).toBe("/screening");
  expect(url.search).toBe("?rule=additive_u");
  // Once the list is on screen, a school that is in it only under the urgency-omitted rule the screen opens on is not
  // there, so the view came from the link.
  await expect(orderedRow(page, "Sample School 01")).toHaveCount(1);
  await expect(orderedRow(page, "Sample School 23")).toHaveCount(0);
});
