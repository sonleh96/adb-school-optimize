/**
 * The list of the explore page's questions at its top (components/explore/QuestionIndex.tsx). Failure modes, each with
 * the test that catches it:
 *  1. The list misses a question the page asks, lists one it does not, or orders them otherwise than the page
 *                                        -> "lists every question of the page, in its order, and links to each"
 *  2. A link leads nowhere, or to another question            -> the same test
 *  3. The list reaches a screen reader as anything but a named list of the page's questions -> the same test
 * That a keyboard meets the list's links before the picker is checked with the rest of the page's keyboard path, in
 * explore.spec.ts.
 */
import { EXPLORE } from "../lib/screening/copy/explore";

import { expect, test } from "./screening-helpers";

/** The page's sections, in its order, by the region each marks itself with. */
const SECTIONS = ["compare", "stability", "drivers", "province", "province-map"];

test("lists every question of the page, in its order, and links to each", async ({ page }) => {
  await page.goto("/explore");
  const index = page.getByRole("navigation", { name: EXPLORE.index });
  await expect(index).toBeVisible({ timeout: 45_000 });
  const questions = await page.locator("#charts section h2[id]").evaluateAll((hs) =>
    hs.map((h) => ({
      id: h.id,
      text: h.textContent,
      region: h.closest("[data-region]")!.getAttribute("data-region"),
    }))
  );
  expect(questions.map((q) => q.region)).toEqual(SECTIONS);
  await expect(index.getByRole("list")).toBeVisible();
  const links = index.getByRole("link");
  await expect(links).toHaveCount(SECTIONS.length);
  for (const [i, q] of questions.entries()) {
    await expect(links.nth(i)).toHaveText(q.text!);
    await expect(links.nth(i)).toHaveAttribute("href", `#${q.id}`);
  }
  // Each link takes the reader to its own question.
  for (const [i, q] of questions.entries()) {
    await links.nth(i).click();
    await expect(page.locator(`[id="${q.id}"]`)).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
});
