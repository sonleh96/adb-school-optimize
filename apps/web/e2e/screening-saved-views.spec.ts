/**
 * Saved views for meetings, on the fixture datasets. Failure modes and the test for each (notes/final.md,
 * "Interaction checks": saved views open, Page Down, save a fifth, remove it, present):
 *  1. A view does not open as a rail step, lands on the wrong screen, or shows a second counter  -> "the seeds open ..."
 *  2. A pasted link to a view does not reproduce it, or presenting it does not widen the rail    -> "a pasted link ..."
 *  3. Page Down and Page Up do not step through the views, or cross into the guides; Presentation mode does not
 *     start at view 1                                                                           -> "presenting ..."
 *  4. Saving a fifth view loses the screen or the name, does not last a reload, or removing it removes another
 *                                                                                               -> "save a fifth ..."
 *  5. The screen moves on from a view and the rail does not say so, or cannot put it back       -> "when the screen ..."
 *  6. A 60-character unbroken name pushes the remove button out of the rail or the title past it, at 26 and 32 px,
 *     or a typed name reads as part of the sentence (R2, R18)                                    -> "worst-case names ..."
 *  7. Junk in storage, or storage the browser blocks, breaks the screen                         -> "junk storage ..." and
 *                                                                                                  "blocked storage ..."
 *  8. A seed whose subject the data lacks is offered (R13)                                      -> "on data with one school ..."
 *  9. The pack tab loses the list or its record, Copy all links copies something else, the download misses a view or
 *     a rule's record, or is not named in plain words                                           -> "the sheet's saved views tab ..."
 * 10. The plain tab shows method words; the method tab loses the formula and the fingerprints   -> "the sheet's saved ..."
 *                                                                                                  and "with the method details ..."
 * 11. A guide step lands on the saved views tab, or the next "Download the top list" opens on it -> "a guide step ..."
 * 12. The narrow layout scrolls sideways, or hides the views or the step's controls             -> "in the narrow layout ..."
 * 13. Restore the starting views drops a saved view without asking, asks when nothing of the person's would be
 *     lost, or leaves the focus nowhere                                                          -> "restoring the starting views ..."
 * 14. An empty list shows nothing in the rail or the sheet, or the sheet's record and download offer a file of
 *     nothing                                                                                    -> "with no saved views ..."
 * 15. A saved view is promised to keep the map position, which a link cannot                     -> "the note under the heading ..."
 * 16. The method tab's heading and its Shows column name the tab, not what each view opens on    -> "with the method details on ..."
 * 17. Any screen still promises that a view keeps the map position                             -> "no screen promises ..."
 * 18. A view whose school or rule is gone still points at a school card, and nothing marks what it dropped
 *                                                                                               -> "a view whose school ..."
 * 19. Two tabs overwrite each other's views, and one tab's rail never hears of the other's      -> "two tabs ..."
 * 20. A name of nothing but invisible characters is saved                                       -> "a name of only ..."
 * 21. Thousands of stored views make the rail take seconds to draw, and saving goes on past any cap
 *                                                                                               -> "thousands of stored ..."
 * 22. A pasted link to a saved view opens whatever sits at that place in the reader's own list  -> "a link to a view ..."
 * 23. The pack's record describes lists of another length than its file, or one rule's groups for all
 *                                                                                               -> "the pack's record ..."
 */
import { readFileSync } from "node:fs";

import type { BrowserContext, Page } from "@playwright/test";

import {
  ORDERED,
  expect,
  keyOf,
  openWorkspace,
  orderedNames,
  orderedRow,
  rowsOf,
  test,
  useMockDataset,
  waitForMap,
} from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 }, firstVisit: true });
test.describe.configure({ timeout: 90_000 });

const VIEWS_KEY = "rise-screening-saved-views-v1";
const SEEDS = [
  "Top of the list under the paper's main rule",
  "With and without urgency",
  "A school with possible places",
  "Schools with incomplete records",
];
/** The range school the seed chooses by role: the best possible place, then the worst. */
const RANGE_KEY = rowsOf("additive_u")
  .filter((row) => row.cohort === "interval")
  .map(
    (row) =>
      row as unknown as { school: { school_key: string }; rank_bounds: { best: number; worst: number } }
  )
  .sort((a, b) => a.rank_bounds.best - b.rank_bounds.best || a.rank_bounds.worst - b.rank_bounds.worst)[0]
  .school.school_key;
// A 60-character name with no break opportunity, the longest the field takes (R2).
const TOKEN = "KUNDIAWA_PROVINCIAL_EDUCATION_BOARD_BRIEFING_OCTOBER_2026_V2";

const rail = (page: Page) => page.getByTestId("guide-rail");
const section = (page: Page) => page.locator("[data-region=saved-views]");
const viewButtons = (page: Page) => section(page).locator("button[data-view]");
const counter = (page: Page) => page.getByTestId("view-counter");
const stepTitle = (page: Page) => page.getByTestId("guide-step-title");
const drift = (page: Page) => page.getByTestId("guide-drift");
const sheet = (page: Page) => page.locator("[data-region=export-sheet]");
const workspace = (page: Page) => page.evaluate(() => window.__screeningWorkspace!.getState());
const railState = (page: Page) =>
  page.evaluate(() => window.__screeningGuide!.snapshot().state.rail as { kind: string; step?: number });

async function store(context: BrowserContext, value: string) {
  await context.addInitScript(
    ([key, text]) => {
      if (window.sessionStorage.getItem("w4b-seeded")) return;
      window.sessionStorage.setItem("w4b-seeded", "1");
      window.localStorage.setItem(key, text);
    },
    [VIEWS_KEY, value]
  );
}

/** A page whose screen is partly covered (the export sheet, or a card with the list aside) has no visible heading to wait for. */
async function open(page: Page, search: string) {
  await page.goto(`/screening${search}`);
  await waitForMap(page);
}

async function startList(page: Page, search = "") {
  await openWorkspace(page, search || "?");
  await expect(viewButtons(page).first()).toBeEnabled();
}

/** Every element under `root` whose content runs past its own box, other than scrollers. */
const spills = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate((root) =>
      [root, ...root.querySelectorAll("*")]
        .filter(
          (el) =>
            el.clientWidth > 1 &&
            !el.closest("[aria-hidden=true]") &&
            el.scrollWidth > el.clientWidth + 1 &&
            !["auto", "scroll"].includes(getComputedStyle(el).overflowX)
        )
        .map((el) => `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 40)}`)
    );
const inside = (inner: { x: number; width: number }, outer: { x: number; width: number }) =>
  inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;

test("the seeds open as rail steps with one counter, each on its own screen, through Next to the end", async ({
  page,
}) => {
  await startList(page);
  await expect(viewButtons(page)).toHaveText(SEEDS.map((name, i) => `${i + 1}${name}`));
  await viewButtons(page).first().click();
  await expect(counter(page)).toHaveText("Saved view 1 of 4");
  await expect(stepTitle(page)).toBeFocused();
  await expect(rail(page).getByText(/Step \d of \d/)).toHaveCount(0);
  await expect(rail(page).locator("kbd")).toHaveCount(0);

  const expected = [
    { rule: "additive_u", compare: null, school: null, view: "ranked", qgroup: "province" },
    { rule: "additive_no_u", compare: "additive_u", school: null, view: "ranked", qgroup: "province" },
    { rule: "additive_u", compare: null, school: RANGE_KEY, view: "ranked", qgroup: "province" },
    { rule: "additive_u", compare: null, school: null, view: "queue", qgroup: "evidence" },
  ];
  for (const [i, state] of expected.entries()) {
    await expect(counter(page)).toHaveText(`Saved view ${i + 1} of 4`);
    await expect(stepTitle(page)).toHaveText(SEEDS[i]);
    await expect.poll(() => workspace(page)).toMatchObject(state);
    await expect(page).toHaveURL(new RegExp(`guide=views&gstep=${i + 1}`));
    await expect(page.locator("[data-testid=guide-rings] > div").first()).toBeAttached();
    await expect(drift(page)).toHaveCount(0);
    await rail(page)
      .getByRole("button", { name: i === 3 ? "Finish" : "Next", exact: true })
      .click();
  }
  await expect.poll(() => railState(page)).toEqual({ kind: "off" });
});

test("a pasted link to a saved view reproduces its screen, presenting", async ({ page }) => {
  await open(page, "?guide=views&gstep=3&present=1");
  await expect(counter(page)).toHaveText("Saved view 3 of 4");
  await expect.poll(() => workspace(page)).toMatchObject({ school: RANGE_KEY });
  await expect(page.locator("[data-region=inspector-place]")).toBeVisible();
  expect((await rail(page).boundingBox())!.width).toBe(400);
  await expect(rail(page).getByText("Up next")).toBeVisible();
  await expect(rail(page).getByText(SEEDS[3])).toBeVisible();
  // A link to a view past the last one lands on the last.
  await page.goto("/screening?guide=views&gstep=9");
  await expect(counter(page)).toHaveText("Saved view 4 of 4");
});

test("presenting starts at view 1, and Page Down and Page Up step through the views without leaving them", async ({
  page,
}) => {
  await startList(page);
  await section(page).getByRole("button", { name: "Presentation mode" }).click();
  await expect(counter(page)).toHaveText("Saved view 1 of 4");
  await expect(page).toHaveURL(/guide=views&gstep=1&present=1/);
  await expect(rail(page).locator("kbd")).toHaveText("PgDn");
  await expect(rail(page).getByText("Page Down for next")).toBeVisible();
  await expect(rail(page).locator("p", { hasText: "Up next" })).toContainText(SEEDS[1]);

  await page.keyboard.press("PageUp");
  await expect.poll(() => railState(page)).toEqual({ kind: "view", step: 1 });
  await page.keyboard.press("PageDown");
  await expect.poll(() => railState(page)).toEqual({ kind: "view", step: 2 });
  await expect.poll(() => workspace(page)).toMatchObject({ rule: "additive_no_u", compare: "additive_u" });
  await page.keyboard.press("PageUp");
  await expect.poll(() => railState(page)).toEqual({ kind: "view", step: 1 });
  await rail(page).getByRole("button", { name: "Leave presentation mode" }).click();
  expect((await rail(page).boundingBox())!.width).toBe(312);
  await expect(rail(page).locator("kbd")).toHaveCount(0);
});

test("save a fifth view of the screen, open it after a reload, and remove it", async ({ page }) => {
  await startList(page);
  const name = orderedNames("additive_u")[4];
  const key = keyOf("additive_u", name);
  await orderedRow(page, name).click();
  await section(page).getByRole("textbox", { name: "Name this view" }).fill("  Provincial   board ");
  await section(page).getByRole("button", { name: "Save this view" }).click();
  await expect(section(page).getByRole("status")).toHaveText("Saved as view 5");
  await expect(viewButtons(page)).toHaveCount(5);
  await expect(viewButtons(page).nth(4)).toHaveText("5Provincial board");
  // The name a person typed is set apart as a name.
  await expect(viewButtons(page).nth(4).locator("[data-name-kind=saved-view]")).toHaveText(
    "Provincial board"
  );

  await page.reload();
  await waitForMap(page);
  await expect(viewButtons(page)).toHaveCount(5);
  await page.evaluate(() => window.__screeningWorkspace!.setState({ school: null }));
  await viewButtons(page).nth(4).click();
  await expect(counter(page)).toHaveText("Saved view 5 of 5");
  await expect.poll(() => workspace(page)).toMatchObject({ school: key, rule: "additive_u", view: "ranked" });
  await expect(page.getByTestId("guide-step-body")).toContainText("Rule: Combined factors, with urgency.");
  await expect(rail(page).getByText("The list, the map and the school card")).toBeVisible();
  await expect(drift(page)).toHaveCount(0);

  await rail(page).getByRole("button", { name: "All guides" }).click();
  await section(page).getByRole("button", { name: "Remove the saved view Provincial board" }).click();
  await expect(viewButtons(page)).toHaveText(SEEDS.map((n, i) => `${i + 1}${n}`));
  await expect(page.locator(":focus")).toHaveAttribute("data-remove", "");
  const kept = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)!), VIEWS_KEY);
  expect(kept).toEqual({
    v: 1,
    views: [{ seed: "top" }, { seed: "urgency" }, { seed: "range" }, { seed: "queue" }],
  });
});

test("when the screen moves on from a view the rail says so, and puts it back", async ({ page }) => {
  await startList(page);
  await viewButtons(page).first().click();
  await expect(counter(page)).toHaveText("Saved view 1 of 4");
  await expect(drift(page)).toHaveCount(0);
  await page.locator(`${ORDERED} button`).nth(1).click();
  await expect(drift(page)).toContainText("The screen has moved on from this step.");
  await drift(page).getByRole("button", { name: "Show this step again" }).click();
  await expect.poll(() => workspace(page)).toMatchObject({ school: null });
  await expect(drift(page)).toHaveCount(0);
});

test("worst-case names stay inside the rail at 26 and 32 px and read as names", async ({ page, context }) => {
  expect(TOKEN).toHaveLength(60);
  const diacritics = "Śḱōļa Ūñïvèrsïtÿ Ēxtënsîøn Brïéfïñg för thë Prøvïñcïål Bøård öf Ēdùcàtïøñ";
  await store(
    context,
    JSON.stringify({
      v: 1,
      views: [
        { seed: "top" },
        { name: TOKEN, q: "rule=need_first_u" },
        { name: "J", q: "view=queue" },
        { name: diacritics, q: "" },
      ],
    })
  );
  await startList(page);
  await expect(viewButtons(page)).toHaveCount(4);
  // The 72-character name is held to the field's 60 characters.
  await expect(viewButtons(page).nth(3)).toHaveText(
    `4${Array.from(diacritics).slice(0, 60).join("").trim()}`
  );
  const railBox = (await rail(page).boundingBox())!;
  for (const remove of await section(page).locator("button[data-remove]").all())
    expect(inside((await remove.boundingBox())!, railBox)).toBe(true);
  expect(await spills(page, "[data-region=saved-views]")).toEqual([]);

  await viewButtons(page).nth(1).click();
  await expect(stepTitle(page)).toHaveText(TOKEN);
  await expect(stepTitle(page).locator("[data-name-kind=saved-view]")).toHaveText(TOKEN);
  for (const presenting of [false, true]) {
    if (presenting) await rail(page).getByRole("button", { name: "Presentation mode" }).click();
    await expect(stepTitle(page)).toHaveCSS("font-size", presenting ? "32px" : "26px");
    const box = (await rail(page).boundingBox())!;
    expect(inside((await stepTitle(page).boundingBox())!, box)).toBe(true);
    expect(await spills(page, "[data-testid=guide-rail]")).toEqual([]);
  }
  // A one-letter name in Up next and the step reads as a name, never as punctuation.
  await page.keyboard.press("PageDown");
  await expect(stepTitle(page).locator("[data-name-kind=saved-view]")).toHaveText("J");
  const text = (await rail(page).textContent()) ?? "";
  expect(text).not.toMatch(/\bnull\b|undefined|NaN|—/);
});

for (const junk of ["{broken", "[1,2,3]", '{"v":1,"views":"no"}'])
  test(`junk storage (${junk}) reads as the seeds, with no console problem`, async ({ page, context }) => {
    await store(context, junk);
    await startList(page);
    await expect(viewButtons(page)).toHaveText(SEEDS.map((n, i) => `${i + 1}${n}`));
  });

test("blocked storage keeps the screen and the views working for the visit", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  await startList(page);
  await expect(viewButtons(page)).toHaveCount(4);
  await section(page).getByRole("textbox", { name: "Name this view" }).fill("Board");
  await section(page).getByRole("button", { name: "Save this view" }).click();
  await expect(viewButtons(page)).toHaveCount(5);
  await viewButtons(page).nth(4).click();
  await expect(counter(page)).toHaveText("Saved view 5 of 5");
});

test("on data with one school only the seeds it can show are offered, and they run", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "one");
  await page.goto("/screening");
  await expect(viewButtons(page).first()).toBeEnabled();
  const names = await viewButtons(page).allTextContents();
  expect(names.join("|")).not.toContain(SEEDS[2]);
  expect(names.join("|")).not.toContain(SEEDS[3]);
  expect(names[0]).toBe(`1${SEEDS[0]}`);
  for (let i = 1; i <= names.length; i += 1) {
    await page.goto(`/screening?guide=views&gstep=${i}`);
    await expect(counter(page)).toHaveText(`Saved view ${i} of ${names.length}`);
    await expect(drift(page)).toHaveCount(0);
  }
});

test("the sheet's saved views tab lists the views, copies their links and downloads them with their record", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "?guide=off&panel=export&pack=1");
  await expect(sheet(page).getByRole("heading", { name: "Saved views for meetings" })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Saved views for meetings" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const items = sheet(page).locator("[data-region=pack-table] li");
  await expect(items).toHaveCount(4);
  await expect(items.nth(1)).toContainText("Combined factors, without urgency");
  await expect(items.nth(3)).toContainText("Incomplete records");
  const record = sheet(page).locator("[data-region=pack-record]");
  await expect(record).toHaveAttribute("aria-busy", "false");
  await expect(record).toContainText("Rules the saved views use");
  await expect(record).toContainText("Combined factors, with urgency. The paper's main rule.");
  await expect(record).toContainText(/\d+ source files?\./);
  const plain = (await sheet(page).innerText()) ?? "";
  for (const word of ["additive_u", "sha256", "Formula", "Briefing", "Dirichlet", "×", "—"])
    expect(plain, `the plain tab says "${word}"`).not.toContain(word);

  await sheet(page).getByRole("button", { name: "Copy all links" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Links to the saved views copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const origin = new URL(page.url()).origin;
  expect(copied).toBe(
    [
      `1. ${SEEDS[0]}\n${origin}/screening`,
      `2. ${SEEDS[1]}\n${origin}/screening?rule=additive_no_u&compare=additive_u`,
      `3. ${SEEDS[2]}\n${origin}/screening?school=${RANGE_KEY}`,
      `4. ${SEEDS[3]}\n${origin}/screening?view=queue&qgroup=evidence`,
    ].join("\n\n")
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet(page).getByRole("button", { name: "Download the saved views" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^rise-png-saved-views-\d{4}-\d{2}-\d{2}\.json$/);
  const pack = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(pack.saved_views.map((v: { order: number; name: string }) => [v.order, v.name])).toEqual(
    SEEDS.map((n, i) => [i + 1, n])
  );
  expect(Object.keys(pack.method_record)).toEqual(["additive_u", "additive_no_u"]);
  expect(pack.method_record.additive_u).toContain("rule_id: additive_u");
  await expect(
    page.getByRole("status").filter({ hasText: "Downloaded the saved views for meetings." })
  ).toBeVisible();

  // Closing the sheet closes the tab: Download the top list opens on the top list.
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Download the top list" }).click();
  await expect(sheet(page).getByRole("button", { name: "Top list", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect.poll(() => workspace(page)).toMatchObject({ panel: "export", pack: false });
});

test("with the method details on, the tab shows each rule's formula and the files' fingerprints", async ({
  page,
}) => {
  await open(page, "?guide=off&analyst=1&panel=export&pack=1");
  const table = sheet(page).locator("[data-region=pack-table]");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table.locator("thead")).toContainText("Saved view");
  await expect(sheet(page).getByText("Saved views, in order", { exact: true })).toBeVisible();
  // What each view opens on, not the names of the tabs.
  const shows = table.locator("tbody tr td:nth-child(3)");
  await expect(shows.nth(0)).toHaveText("Schools in order");
  await expect(shows.nth(1)).toHaveText("Schools in order · compared with Combined");
  await expect(shows.nth(2)).toHaveText(/^Schools in order · /);
  await expect(shows.nth(3)).toHaveText("Incomplete records, grouped by what is missing");
  await expect(table.locator("tbody tr").nth(1)).toContainText("compared with");
  const record = sheet(page).locator("[data-region=pack-record]");
  await expect(record).toHaveAttribute("aria-busy", "false");
  await expect(record).toContainText("additive_no_u");
  await expect(record.locator("li").first()).toContainText("sha256");
});

test("the note under the heading promises only what a link restores", async ({ page }) => {
  await startList(page);
  const note = section(page).locator("p").first();
  await expect(note).toContainText("keeps the rule, the list and its tab, the selected school, the grouping");
  await expect(note).toContainText("The map position is not kept.");
  await expect(note).not.toContainText("and the map position");
});

test("restoring the starting views asks before it drops a saved view, and not when nothing of the person's is lost", async ({
  page,
}) => {
  await startList(page);
  const restore = section(page).locator("[data-region=reset-views]");
  await expect(restore).toHaveCount(0);

  // Removing a starting view alone: restoring brings it back at once, with no question.
  await section(page)
    .getByRole("button", { name: /^Remove the saved view With and without urgency/ })
    .click();
  await expect(viewButtons(page)).toHaveCount(3);
  await expect(restore).toHaveText("Restore the starting views");
  await restore.click();
  await expect(viewButtons(page)).toHaveText(SEEDS.map((n, i) => `${i + 1}${n}`));
  await expect(section(page).getByRole("status")).toHaveText("Starting views restored");
  await expect(viewButtons(page).first()).toBeFocused();
  await expect(restore).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), VIEWS_KEY)).toBeNull();

  // A saved view is only dropped on the second press, and Keep my views backs out.
  await section(page).getByRole("textbox", { name: "Name this view" }).fill("Provincial board");
  await section(page).getByRole("button", { name: "Save this view" }).click();
  await expect(viewButtons(page)).toHaveCount(5);
  await restore.click();
  await expect(restore).toHaveText("Remove my views and restore the starting ones");
  await expect(viewButtons(page)).toHaveCount(5);
  await section(page).locator("[data-region=keep-views]").click();
  await expect(restore).toHaveText("Restore the starting views");
  await expect(viewButtons(page)).toHaveCount(5);
  await restore.click();
  await restore.click();
  await expect(viewButtons(page)).toHaveText(SEEDS.map((n, i) => `${i + 1}${n}`));
  expect(await spills(page, "[data-region=saved-views]")).toEqual([]);
});

test("with no saved views the rail and the sheet's tab say so, and restoring brings the starting ones back", async ({
  page,
  context,
}) => {
  const SAYS =
    "There are no saved views yet. Give the screen a name and save it, and it will be listed here.";
  await store(context, JSON.stringify({ v: 1, views: [] }));
  await startList(page).catch(() => undefined);
  await expect(section(page).locator("[data-region=no-views]")).toHaveText(SAYS);
  await expect(viewButtons(page)).toHaveCount(0);
  await expect(section(page).getByRole("button", { name: "Presentation mode" })).toHaveCount(0);

  await page.goto("/screening?guide=off&panel=export&pack=1");
  await waitForMap(page);
  await expect(sheet(page).locator("[data-region=no-views]")).toHaveText(SAYS);
  await expect(sheet(page).locator("[data-region=pack-record]")).toHaveCount(0);
  await expect(sheet(page).getByRole("button", { name: "Copy all links" })).toBeDisabled();
  await expect(sheet(page).getByRole("button", { name: "Download the saved views" })).toBeDisabled();

  await startList(page).catch(() => undefined);
  await section(page).locator("[data-region=reset-views]").click();
  await expect(viewButtons(page)).toHaveCount(4);
  await expect(section(page).locator("[data-region=no-views]")).toHaveCount(0);
});

test("a guide step never lands on the saved views tab", async ({ page }) => {
  await open(page, "?panel=export&pack=1&guide=q1&gstep=1");
  await expect(page.getByTestId("guide-step-title")).toBeVisible();
  await expect.poll(() => workspace(page)).toMatchObject({ panel: null, pack: false });
});

test("worst-case names stay inside the sheet's list", async ({ page, context }) => {
  await useMockDataset(context, "worst-names");
  await store(
    context,
    JSON.stringify({ v: 1, views: [{ seed: "range" }, { seed: "queue" }, { name: TOKEN, q: "view=queue" }] })
  );
  await open(page, "?guide=off&panel=export&pack=1");
  await expect(sheet(page).locator("[data-region=pack-table] li").last()).toContainText(TOKEN);
  expect(await spills(page, "[data-region=export-sheet]")).toEqual([]);
});

test.describe("in the narrow layout", () => {
  for (const size of [
    { width: 768, height: 1024 },
    { width: 800, height: 500 },
  ])
    test(`the views, a view's step and the pack tab fit at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openWorkspace(page, "?");
      await expect(viewButtons(page).first()).toBeEnabled();
      await viewButtons(page).nth(2).scrollIntoViewIfNeeded();
      await expect(section(page).getByRole("button", { name: "Presentation mode" })).toHaveCount(0);
      await viewButtons(page).nth(2).click();
      await expect(counter(page)).toHaveText("Saved view 3 of 4");
      await expect(rail(page).getByRole("button", { name: "Next" })).toBeInViewport();
      await expect.poll(() => workspace(page)).toMatchObject({ school: RANGE_KEY });
      expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);

      await page.goto("/screening?guide=off&panel=export&pack=1");
      await waitForMap(page);
      await expect(sheet(page).locator("[data-region=pack-table] li")).toHaveCount(4);
      await expect(sheet(page).getByRole("button", { name: "Download the saved views" })).toBeInViewport();
      expect(await spills(page, "[data-region=export-sheet]")).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
    });
});

test("a name of only invisible characters is not saved", async ({ page }) => {
  await startList(page);
  await section(page).getByRole("textbox", { name: "Name this view" }).fill("\u200b\u200c\u2060");
  await section(page).getByRole("button", { name: "Save this view" }).click();
  await expect(section(page).getByRole("textbox", { name: "Name this view" })).toBeFocused();
  await expect(viewButtons(page)).toHaveCount(4);
});

test("thousands of stored views are read up to the cap, and saving stops there", async ({
  page,
  context,
}) => {
  const many = Array.from({ length: 30000 }, (_, i) => ({ name: `View ${i + 1}`, q: "" }));
  await store(context, JSON.stringify({ v: 1, views: many }));
  await openWorkspace(page, "?");
  await expect(viewButtons(page)).toHaveCount(50, { timeout: 5000 });
  await expect(section(page).getByRole("button", { name: "Save this view" })).toBeDisabled();
});
