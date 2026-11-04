/**
 * The data version on screen, beside the caveat, so a reader knows which data the list comes from. Failure modes and
 * the test for each:
 *  1. The screen names no data version, on a computer or on a phone              -> both tests, line visible
 *  2. The screen names a different version from the files: the plain download's first line, which the printout
 *     shares, and the research file's method record                             -> "...the same version as..."
 *  3. The date beside it is not the day the data version was loaded: a rerun of the same data on a later day would
 *     then show the rerun's day as "loaded"                                    -> "...the day the data version was loaded..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { csvRows } from "../lib/screening/method/top-csv";

import { expect, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const fixture = (file: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/screening", file), "utf8"));
const RESULTS = fixture("results/additive_no_u.json");
const VERSION = fixture("rules.json").input_versions.find(
  (v: { input_version: string }) => v.input_version === RESULTS.run.input_version
);
/** A day as a reader in this time zone reads it, worked out here rather than by the code under test. */
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const LINE = `Data version ${RESULTS.run.input_version}, loaded ${dayOf(VERSION.created_at)}.`;
/** The version a line names: the word after "data version", without the comma or full stop that may end it. */
const versionIn = (text: string) => /data version (\S+?)(?=[,.]?(?:\s|$))/i.exec(text)?.[1];

test.describe("at 1440 by 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the line beside the caveat names the same version as the download, the printout and the research file", async ({
    page,
  }) => {
    await page.goto("/screening");
    await waitForMap(page);
    const line = page.locator("[data-region=data-version]:visible");
    await expect(line).toHaveText(LINE);
    // Beside the caveat: in the map's foot, under it.
    const caveat = (await page.locator("[data-region=caveat]").boundingBox())!;
    const box = (await line.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(caveat.y + caveat.height - 1);
    expect(box.y - (caveat.y + caveat.height)).toBeLessThan(8);
    const onScreen = versionIn((await line.textContent())!);
    expect(onScreen).toBe(RESULTS.run.input_version);

    await page.getByRole("button", { name: "Download or print the list" }).click();
    const sheet = page.getByRole("dialog");
    const [plain] = await Promise.all([
      page.waitForEvent("download"),
      sheet.getByRole("button", { name: "Download the list" }).click(),
    ]);
    // The printout starts with the same line as the download (plain-list.ts, listHead).
    const first = csvRows(readFileSync((await plain.path())!, "utf8"))[0][0];
    expect(versionIn(first)).toBe(onScreen);

    const [research] = await Promise.all([
      page.waitForEvent("download"),
      sheet.getByRole("button", { name: "Download the research file" }).click(),
    ]);
    const record = readFileSync((await research.path())!, "utf8");
    expect(/# input_version: (\S+)"/.exec(record)?.[1]).toBe(onScreen);
  });

  test("the date is the day the data version was loaded, not the day its list was made", async ({ page }) => {
    // The fixture pins every time to one instant, so here the version is loaded weeks before its list is made, as
    // when the same data is run again later.
    const loaded = "2025-12-09T08:00:00Z";
    expect(dayOf(loaded)).not.toBe(dayOf(RESULTS.run.created_at));
    await page.route(/\/api\/v1\/screening\/rules(\?|$)/, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      for (const v of body.input_versions)
        if (v.input_version === RESULTS.run.input_version) v.created_at = loaded;
      await route.fulfill({ response, json: body });
    });
    await page.goto("/screening");
    await waitForMap(page);
    await expect(page.locator("[data-region=data-version]:visible")).toHaveText(
      `Data version ${RESULTS.run.input_version}, loaded ${dayOf(loaded)}.`
    );
  });
});

test("rules that name no data versions still load the list, without the version line", async ({ page }) => {
  await page.route(/\/api\/v1\/screening\/rules(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.input_versions;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/screening");
  await waitForMap(page);
  await expect(page.locator("ol[aria-label='The list'] button").first()).toBeVisible();
  await expect(page.locator("[data-region=caveat]")).toBeVisible();
  await expect(page.locator("[data-region=data-version]")).toHaveCount(0);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]) {
  test.describe(`at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test("the list's head names the data version under the caveat", async ({ page }) => {
      await page.goto("/screening");
      await waitForMap(page);
      const line = page.locator("[data-region=data-version]:visible");
      await expect(line).toHaveText(LINE);
      const caveat = (await page.locator("[data-region=list-caveat]").boundingBox())!;
      const box = (await line.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(caveat.y + caveat.height - 1);
      expect(box.y - (caveat.y + caveat.height)).toBeLessThan(8);
    });
  });
}
