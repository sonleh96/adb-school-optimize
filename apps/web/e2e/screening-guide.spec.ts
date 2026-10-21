/**
 * The guide rail, on the fixture datasets. Failure modes and the test for each (notes/final.md, "Interaction checks,
 * mapped to failure modes"):
 *  1. A first-time user lands on a closed rail, or a returning user is taught twice   -> "a first visit ..." and
 *     "a returning visitor ..."
 *  2. A guide step lands on the wrong screen, or a pasted link does not reproduce it   -> "every step sets ..." and
 *     "a pasted link ..."
 *  3. A ring points at nothing, or a step says the screen moved on when it has not    -> "every step sets ..."
 *  4. A step that follows the selection does not retitle for the school chosen, or keeps it past a school it
 *     cannot explain                                                                   -> "a step that follows ..."
 *  5. The screen moves on and the rail does not say so, or cannot put it back          -> "when the screen moves on ..."
 *  6. Presenting breaks the sequence, or first-time users see two counters or key hints -> "presenting ..." and
 *     "one counter ..."
 *  7. A guide whose example the data lacks is offered, or the rail breaks on one school (R13) -> "on data with one school ..."
 *  8. A long or one-letter name leaves the rail or reads as punctuation (R7, R18, R23) -> "worst-case names ..."
 *  9. The guide copy fails to download and the rail is stuck                           -> "a failed download ..."
 * 10. Guides can be started before there is anything to guide (R14)                    -> "with no schools ..."
 * 11. The narrow layout keeps the rail beside the map, or a map step hides the map     -> "in the narrow layout ..."
 */
import type { Page } from "@playwright/test";

import { ORDERED, expect, openWorkspace, test, useMockDataset, waitForMap } from "./screening-helpers";

test.use({ viewport: { width: 1600, height: 1000 }, firstVisit: true });
test.describe.configure({ timeout: 90_000 });

const MEMORY = "rise-screening-guides-v1";
const rail = (page: Page) => page.getByTestId("guide-rail");
const stepTitle = (page: Page) => page.getByTestId("guide-step-title");
const railState = (page: Page) =>
  page.evaluate(
    () => window.__screeningGuide!.snapshot().state.rail as { kind: string; guide?: string; step?: number }
  );
const workspace = (page: Page) => page.evaluate(() => window.__screeningWorkspace!.getState());
const ringCount = (page: Page) => page.locator("[data-testid=guide-rings] > div").count();

async function ready(page: Page, search = "") {
  await openWorkspace(page, search || "?");
  await expect(page.locator("[data-region=ranked-list], [data-region=queue-list]").first()).toBeAttached();
}

/** Waits until the rings have settled on at least one region. */
async function ringed(page: Page) {
  await expect.poll(() => ringCount(page), { timeout: 10_000 }).toBeGreaterThan(0);
}

test("a first visit opens the rail at its start, with the guides the data can teach", async ({ page }) => {
  await ready(page);
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeVisible();
  await expect(rail(page).locator("button[data-guide]")).toHaveCount(5);
  await expect(rail(page).getByRole("button", { name: /How this works/ })).toBeVisible();
  // The rail's place comes out of the map, not out of the list: the column starts at the rail's edge.
  const railBox = (await rail(page).boundingBox())!;
  const column = (await page.locator("[data-slot=column]").boundingBox())!;
  expect(railBox.width).toBe(312);
  expect(column.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
  // Explore on my own closes it and remembers, so the next visit starts closed.
  await rail(page).getByRole("button", { name: "Explore on my own" }).click();
  await expect(rail(page)).toHaveCount(0);
  await page.reload();
  await openWorkspace(page, "?");
  await expect(rail(page)).toHaveCount(0);
  await expect(page.getByRole("toolbar").getByRole("button", { name: "Guides" })).toBeEnabled();
});

/** Holds the page's scripts back, so the server's HTML is on screen before the page runs, as on a slow laptop. */
const slowScripts = (page: Page) =>
  page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

test("a first visit paints with the rail's place already kept, so nothing moves sideways when the page runs", async ({
  page,
}) => {
  await slowScripts(page);
  await page.goto("/screening", { waitUntil: "domcontentloaded" });
  // Before any of the page's scripts have run, the server's HTML already leaves the rail's width free.
  const left = await page
    .locator("[data-slot=stage]")
    .evaluate((stage) => stage.getBoundingClientRect().left);
  expect(left).toBe(312);
  expect(await page.evaluate(() => typeof window.__screeningGuide)).toBe("undefined");
  await waitForMap(page);
  expect((await page.locator("[data-slot=stage]").boundingBox())!.x).toBe(312);
});

test("a returning visitor starts with the rail closed and sees what they have seen", async ({
  page,
  context,
}) => {
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [MEMORY, JSON.stringify({ seen: true, done: ["q1", "q2"], last: { guide: "q5", step: 2 } })]
  );
  await ready(page);
  await expect(rail(page)).toHaveCount(0);
  const guides = page.getByRole("toolbar").getByRole("button", { name: "Guides" });
  await expect(guides).toContainText("2 of 5 seen");
  await guides.click();
  await expect(rail(page).getByText("Guides", { exact: true })).toBeVisible();
  const rows = rail(page).locator("button[data-guide]");
  await expect(rows.nth(0)).toContainText("Seen");
  await expect(rows.nth(1)).toContainText("Seen");
  await expect(rows.nth(3)).toContainText("2 steps");
  await expect(rows.nth(4)).toContainText("Step 2 of 4");
  await expect(rail(page).getByRole("button", { name: "Close guides" })).toBeVisible();
});

/** What each step must leave on screen: the workspace keys it sets, and a region its ring is round. */
const SCRIPT: { guide: string; step: number; state: Record<string, unknown>; shows: string }[] = [
  { guide: "q1", step: 1, state: { rule: "additive_u", school: null, view: "ranked" }, shows: ORDERED },
  { guide: "q1", step: 2, state: { rule: "additive_u", school: null }, shows: "[data-region=rule-identity]" },
  { guide: "q1", step: 3, state: { rule: "additive_u", school: null }, shows: "[data-region=legend]" },
  {
    guide: "q2",
    step: 1,
    state: { rule: "additive_u", view: "ranked" },
    shows: "[data-region=inspector-why]",
  },
  { guide: "q2", step: 2, state: { rule: "additive_u" }, shows: "[data-region=need-box]" },
  { guide: "q2", step: 3, state: { rule: "additive_u" }, shows: "[data-region=inspector-breakdown]" },
  { guide: "q3", step: 1, state: { rule: "additive_u" }, shows: "[data-region=inspector-place]" },
  { guide: "q3", step: 2, state: { rule: "additive_u", school: null }, shows: "[data-region=list-order]" },
  { guide: "q3", step: 3, state: { rule: "additive_u", school: null }, shows: "[data-region=legend-range]" },
  { guide: "q4", step: 1, state: { view: "queue", school: null }, shows: "[data-region=queue-list]" },
  // Grouping by what is missing arrives with the workspace's Group by control; until then guide 4 has two steps.
  { guide: "q4", step: 2, state: { view: "queue" }, shows: "[data-region=inspector-place]" },
  {
    guide: "q5",
    step: 1,
    state: { rule: "additive_no_u", compare: "additive_u" },
    shows: "[data-region=changed-lead]",
  },
  {
    guide: "q5",
    step: 2,
    state: { rule: "additive_no_u", compare: "additive_u" },
    shows: "[data-region=rule-switch]",
  },
  {
    guide: "q5",
    step: 3,
    state: { rule: "additive_no_u", compare: "additive_u" },
    shows: "[data-region=changed-example]",
  },
  {
    guide: "q5",
    step: 4,
    state: { rule: "additive_no_u", compare: "additive_u" },
    shows: "[data-region=rule-switch]",
  },
];

test("every step sets its screen, rings what it points at and says nothing has moved on, through Next to the end", async ({
  page,
}) => {
  await ready(page);
  await rail(page).locator("button[data-guide=q1]").click();
  for (const [index, expected] of SCRIPT.entries()) {
    await expect
      .poll(() => railState(page))
      .toEqual({ kind: "step", guide: expected.guide, step: expected.step });
    await expect(page).toHaveURL(new RegExp(`guide=${expected.guide}&gstep=${expected.step}`));
    await expect.poll(() => workspace(page)).toMatchObject(expected.state);
    await expect(page.locator(expected.shows).first()).toBeVisible();
    await ringed(page);
    await expect(page.getByTestId("guide-drift")).toHaveCount(0);
    const next = rail(page).getByRole("button", { name: /^(Next|Next guide|Finish)$/ });
    if (index < SCRIPT.length - 1) await next.click();
  }
  // Finish closes the rail and counts every guide as seen.
  await rail(page).getByRole("button", { name: "Finish", exact: true }).click();
  await expect(rail(page)).toHaveCount(0);
  const memory = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!), MEMORY);
  expect(memory.done).toEqual(["q1", "q2", "q3", "q4", "q5"]);
});

test("opening a guide moves focus to its step, and closing the rail hands focus to Guides", async ({
  page,
}) => {
  await ready(page);
  await rail(page).locator("button[data-guide=q2]").click();
  await expect(stepTitle(page)).toBeFocused();
  await rail(page).getByRole("button", { name: "Skip this guide" }).click();
  await expect(rail(page)).toHaveCount(0);
  await expect(page.getByRole("toolbar").getByRole("button", { name: "Guides" })).toBeFocused();
  // By keyboard too: the start list opens with its title focused, and Enter on a guide focuses its step.
  await page.keyboard.press("Enter");
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeFocused();
  await rail(page).locator("button[data-guide=q1]").focus();
  await page.keyboard.press("Enter");
  await expect(stepTitle(page)).toBeFocused();
});

test("rings follow a scrolled panel at once and ease only between steps", async ({ page }) => {
  await ready(page, "?guide=q1&gstep=1");
  await ringed(page);
  const ring = page.locator("[data-testid=guide-rings] > div").first();
  await expect(ring).not.toHaveAttribute("data-moving", /.*/);
  // The ring is cut to the list's visible part, so as the rows scroll up its lower edge rises with them.
  const bottom = async () => {
    const box = (await ring.boundingBox())!;
    return Math.round(box.y + box.height);
  };
  const before = await bottom();
  await page.locator("#screening-list").evaluate((list) => (list.scrollTop = 40));
  await expect.poll(bottom).toBe(before - 40);
  await expect(ring).not.toHaveAttribute("data-moving", /.*/);
  await rail(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(ring).toHaveAttribute("data-moving");
  await expect(ring).not.toHaveAttribute("data-moving", /.*/);
});

test("a pasted link to a step reproduces its screen", async ({ page }) => {
  await ready(page, "?guide=q4&gstep=2");
  await expect(stepTitle(page)).toContainText("What");
  await expect.poll(() => workspace(page)).toMatchObject({ view: "queue" });
  const { school } = await workspace(page);
  expect(school).not.toBeNull();
  await expect(page.locator("[data-region=inspector]")).toBeVisible();
  await expect(page.locator(`[data-school-key="${school}"]`)).toHaveAttribute("aria-pressed", "true");
  // A link to the urgency guide puts the proposed revision on screen with What changed.
  await ready(page, "?guide=q5&gstep=1");
  await expect(page.locator("[data-region=changed-lead]")).toBeVisible();
  await expect(page.getByRole("button", { name: /without urgency/, pressed: true })).toBeVisible();
});

test("a step that follows the selection retitles for the school chosen and keeps it on the next step", async ({
  page,
}) => {
  await ready(page, "?guide=q2&gstep=1");
  await expect(page.locator("[data-region=inspector]")).toBeVisible();
  const first = (await stepTitle(page).textContent())!;
  // The list may have stepped aside for the card; choose the next school from the card itself.
  await page.getByRole("button", { name: "Next school" }).click();
  await expect(stepTitle(page)).not.toHaveText(first);
  const chosen = (await workspace(page)).school;
  const name = await page.locator("[data-region=inspector] h2").textContent();
  await expect(stepTitle(page)).toContainText(name!);
  await expect(page.getByTestId("guide-drift")).toHaveCount(0);
  await rail(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(async () => (await workspace(page)).school).toBe(chosen);
});

test("when the screen moves on from a step the rail says so, and puts it back", async ({ page }) => {
  await ready(page, "?guide=q1&gstep=2");
  await ringed(page);
  await page.evaluate(() => window.__screeningWorkspace!.setState({ rule: "benchmark" }));
  await expect(page.getByTestId("guide-drift")).toContainText("The screen has moved on from this step.");
  await page.getByRole("button", { name: "Show this step again" }).click();
  await expect.poll(async () => (await workspace(page)).rule).toBe("additive_u");
  await expect(page.getByTestId("guide-drift")).toHaveCount(0);
  // Every key a step sets counts: opening the scope detail moves the screen on too.
  await page.evaluate(() => window.__screeningWorkspace!.setState({ scope: true }));
  await expect(page.getByTestId("guide-drift")).toBeVisible();
  await page.getByRole("button", { name: "Show this step again" }).click();
  await expect.poll(async () => (await workspace(page)).scope).toBe(false);
});

test("presenting widens the rail, shows Up next and the key hints, and Page Down and Page Up cross guides", async ({
  page,
}) => {
  await ready(page, "?guide=q1&gstep=3");
  // One counter, and no key hints, before presenting.
  await expect(rail(page).getByText("Step 3 of 3", { exact: true })).toBeVisible();
  await expect(rail(page).locator("kbd")).toHaveCount(0);
  await expect(rail(page).getByText("Page Down for next")).toHaveCount(0);
  await expect(rail(page).getByText(/Guide \d of \d/)).toHaveCount(0);

  await rail(page).getByRole("button", { name: "Presentation mode" }).click();
  await expect(page).toHaveURL(/present=1/);
  expect((await rail(page).boundingBox())!.width).toBe(400);
  await expect(rail(page).locator("kbd")).toHaveText("PgDn");
  await expect(rail(page).getByText("Page Down for next")).toBeVisible();
  await expect(rail(page).getByText("Up next")).toBeVisible();

  await page.keyboard.press("PageDown");
  await expect.poll(() => railState(page)).toEqual({ kind: "step", guide: "q2", step: 1 });
  await page.keyboard.press("PageUp");
  await expect.poll(() => railState(page)).toEqual({ kind: "step", guide: "q1", step: 3 });
  // Back crosses guides too while presenting.
  await page.keyboard.press("PageDown");
  await rail(page).getByRole("button", { name: "Back" }).click();
  await expect.poll(() => railState(page)).toEqual({ kind: "step", guide: "q1", step: 3 });
  await rail(page).getByRole("button", { name: "Leave presentation mode" }).click();
  expect((await rail(page).boundingBox())!.width).toBe(312);
});

test("on data with one school the rail offers the guides it can teach and they run", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "one");
  await page.goto("/screening");
  await expect(rail(page).locator("button[data-guide]")).toHaveCount(3);
  await expect(rail(page).locator("button[data-guide=q3], button[data-guide=q4]")).toHaveCount(0);
  for (const guide of ["q1", "q2", "q5"]) {
    await page.goto(`/screening?guide=${guide}&gstep=1`);
    await expect(stepTitle(page)).toBeVisible();
    await expect(page.getByTestId("guide-drift")).toHaveCount(0);
  }
  // A link to a guide the data cannot teach falls back to the start.
  await page.goto("/screening?guide=q3&gstep=2");
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeVisible();
});

test("worst-case names stay inside the rail and read as names", async ({ page, context }) => {
  await useMockDataset(context, "worst-names");
  for (const link of [
    "?guide=start",
    "?guide=q1&gstep=1",
    "?guide=q2&gstep=1",
    "?guide=q3&gstep=2",
    "?guide=q4&gstep=2",
  ]) {
    await page.goto(`/screening${link}`);
    await expect(rail(page).locator("aside")).toBeVisible();
    await expect(rail(page).locator("[aria-busy=true]")).toHaveCount(0);
    const spills = await rail(page).evaluate((root) =>
      [...root.querySelectorAll("*")]
        .filter(
          (el) =>
            el.clientWidth > 1 &&
            !el.closest("[aria-hidden=true]") &&
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX !== "auto"
        )
        .map((el) => `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 40)}`)
    );
    expect(spills, link).toEqual([]);
    const text = (await rail(page).textContent()) ?? "";
    expect(text, link).not.toMatch(/\bnull\b|undefined|NaN|—/);
  }
  // Names in a step's sentences are set apart, so even a one-letter name reads as a name (R18).
  await page.goto("/screening?guide=q1&gstep=1");
  const names = rail(page).locator("[data-testid=guide-step-body] [data-name-kind=school]");
  await expect(names).toHaveCount(3);
});

test("a failed download of the guide copy says so, and Retry loads it", async ({ page, problems }) => {
  // The guide copy's chunk fails until the person asks again.
  let allowed = false;
  let failures = 0;
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!allowed && body.includes("What do you want to find out?")) {
      failures += 1;
      return route.abort();
    }
    return route.fulfill({ response, body });
  });
  await page.goto("/screening");
  await waitForMap(page);
  await expect(rail(page).getByRole("alert")).toContainText("Some of the information did not load");
  allowed = true;
  await rail(page).getByRole("button", { name: "Retry" }).click();
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeVisible();
  expect(failures).toBeGreaterThan(0);
  // The aborted chunk is the failure this test provokes.
  problems.splice(0, problems.length, ...problems.filter((p) => !/requestfailed|ERR_FAILED/.test(p)));
});

test("a failed download of a layer's own code says so, and Retry loads it again", async ({
  page,
  problems,
}) => {
  // The rail's own code fails, however often it is asked for, until the person presses Retry; Retry must ask for it
  // again rather than show the same failure.
  let allowed = false;
  let failures = 0;
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!allowed && body.includes("guide-step-title")) {
      failures += 1;
      return route.abort();
    }
    return route.fulfill({ response, body });
  });
  await page.goto("/screening");
  await waitForMap(page);
  await expect(rail(page).getByRole("alert")).toContainText("Some of the information did not load");
  allowed = true;
  await rail(page).getByRole("button", { name: "Retry" }).click();
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeVisible();
  expect(failures).toBeGreaterThan(0);
  // The aborted chunk, and React's report of the error the boundary caught, are what this test provokes.
  problems.splice(
    0,
    problems.length,
    ...problems.filter(
      (p) => !/requestfailed|ERR_FAILED|ChunkLoadError|Failed to load chunk|Loading chunk/i.test(p)
    )
  );
});

test("Page Down and Page Up stay with How this works and the glossary while either is open", async ({
  page,
}) => {
  await ready(page, "?guide=q1&gstep=2&page=how");
  const main = page.getByRole("main", { name: "How this works" });
  await expect(main.locator("section h2")).toHaveCount(6);
  await page.keyboard.press("PageDown");
  await expect(main).toBeVisible();
  expect(await railState(page)).toEqual({ kind: "step", guide: "q1", step: 2 });
  await page.getByRole("button", { name: "Back to the map" }).click();
  await expect(main).toHaveCount(0);
  await page.getByRole("toolbar").getByRole("button", { name: "Glossary of terms" }).click();
  const drawer = page.getByRole("complementary", { name: "Glossary of terms" });
  await drawer.getByRole("button", { name: "Place in the list", exact: true }).click();
  await page.keyboard.press("PageUp");
  await expect(drawer).toBeVisible();
  expect(await railState(page)).toEqual({ kind: "step", guide: "q1", step: 2 });
});

test("with no schools the guides cannot be started", async ({ page, context, problems }) => {
  await useMockDataset(context, "empty");
  await page.goto("/screening");
  await expect(page.getByText("No schools came back")).toBeVisible();
  await expect(rail(page).locator("button[data-guide]")).toHaveCount(0);
  await rail(page).getByRole("button", { name: "Explore on my own" }).click();
  await expect(page.getByRole("toolbar").getByRole("button", { name: "Guides" })).toBeDisabled();
  await expect(page.getByRole("toolbar").getByRole("button", { name: "Explain this screen" })).toBeDisabled();
  // The empty dataset answers its reads with the empty-store 404s this test is about.
  problems.splice(0, problems.length, ...problems.filter((p) => !/404/.test(p)));
});

test.describe("in the narrow layout", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("the rail takes the map band's place, a step on the map shows the band, and nothing scrolls sideways", async ({
    page,
  }) => {
    await ready(page, "?guide=q2&gstep=1");
    const band = (await rail(page).boundingBox())!;
    expect(band.y).toBe(56);
    expect(band.width).toBe(768);
    await expect(rail(page).getByRole("button", { name: "Presentation mode" })).toHaveCount(0);
    await rail(page).getByRole("button", { name: "All guides" }).click();
    await rail(page).locator("button[data-guide=q1]").click();
    await rail(page).getByRole("button", { name: "Next", exact: true }).click();
    await rail(page).getByRole("button", { name: "Next", exact: true }).click();
    // Guide 1 step 3 points at the map: the band returns under a one-line guide bar.
    await expect(page.getByTestId("guide-compact")).toBeVisible();
    await expect(page.getByTestId("screening-map")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true);
    await page
      .getByTestId("guide-compact")
      .getByRole("button", { name: /Next guide/ })
      .click();
    await expect.poll(() => railState(page)).toEqual({ kind: "step", guide: "q2", step: 1 });
  });
});

test("while the guide copy downloads, the rail, the page and the glossary say what is loading", async ({
  page,
}) => {
  // Hold the guide copy's chunk until the test lets it go.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("What do you want to find out?")) await held;
    return route.fulfill({ response, body });
  });
  await page.goto("/screening");
  await waitForMap(page);
  await expect(rail(page).getByRole("status")).toHaveText("Loading the guide");
  await expect(rail(page).locator("[aria-busy=true]")).toHaveCount(1);

  await page.getByRole("toolbar").getByRole("button", { name: "Glossary of terms" }).click();
  await expect(page.getByRole("complementary", { name: "Glossary of terms" }).getByRole("status")).toHaveText(
    "Loading the glossary"
  );

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "How this works" }).first().click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Loading How this works");

  release();
  await expect(rail(page).getByRole("heading", { name: "What do you want to find out?" })).toBeVisible();
  await expect(page.getByRole("main", { name: "How this works" }).locator("section h2")).toHaveCount(6);
});
