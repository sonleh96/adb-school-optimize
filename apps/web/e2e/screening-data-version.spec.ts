/**
 * The data version on screen, beside the caveat, so a reader knows which data the list comes from. Failure modes and
 * the test for each:
 *  1. The screen names no data version, on a computer or on a phone              -> both tests, line visible
 *  2. The screen names a different version from the files: the plain download's first line, which the printout
 *     shares, and the research file's method record                             -> "...the same version as..."
 *  3. The date beside it is not the run's                                         -> the exact line, from the fixture
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { csvRows } from "../lib/screening/method/top-csv";

import { expect, test, waitForMap } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const RESULTS = JSON.parse(
  readFileSync(path.resolve(__dirname, "fixtures/screening/results/additive_no_u.json"), "utf8")
);
/** The run's day as a reader in this time zone reads it, worked out here rather than by the code under test. */
const runDay = new Date(RESULTS.run.created_at).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const LINE = `Data version ${RESULTS.run.input_version}, loaded on ${runDay}.`;
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
