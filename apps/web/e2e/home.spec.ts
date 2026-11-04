/**
 * The homepage at `/`, and the old links to the tool that `/` used to open.
 *
 * Failure modes, each with the test that catches it:
 *  1. `/` opens something other than the homepage, or its main button does not reach the list
 *                                                                          -> "/ is the homepage..."
 *  2. "How it works" does not move to how the list is made, or a link into the tool opens the wrong tab or no guide
 *                                                                          -> "How it works moves..."
 *  3. An old link at `/` with the tool's state in its query lands on the homepage, or reaches the tool without its
 *     query, so a shared view is lost                                      -> "an old link at /..."
 *  4. A homepage link that a sharing service tagged is sent to the tool  -> "a homepage link tagged..."
 *  5. Some width from a small phone to a wide screen scrolls sideways    -> "no width..."
 *  6. A landmark is missing or doubled, a heading level is skipped, the keyboard cannot skip to the content, or the
 *     focus ring vanishes on the navy footer                               -> "one banner..."
 *  7. Smooth scrolling runs for a reader who asked for less motion       -> "smooth scrolling..."
 *  8. Printed, the navy band's white words lose their navy and vanish on white paper
 *                                                                          -> "printed..."
 *  9. Made while its API could not be reached, the page shows a hole, a stray number or a broken sentence where the
 *     counts go                                                            -> "made while its API..."
 * 10. A contact link is missing, goes to the wrong address, or hides the address behind other words
 *                                                                          -> "the study section and the footer..."
 * 11. Search engines index the tool's many view addresses, or are kept off the homepage
 *                                                                          -> "robots.txt..."
 * 12. A picture does not load (a wrong path, a failed resize) at a wide screen or on a phone
 *                                                                          -> "every picture..."
 * 13. A phone downloads a picture it never shows, or one far down the page before the reader gets near it
 *                                                                          -> "a phone fetches..."
 * 14. A screenshot loses its description, or a picture that only decorates is announced to a screen reader
 *                                                                          -> "the screenshots are described..."
 * 15. An outside picture's credit, which its licence asks for, is missing or links somewhere else
 *                                                                          -> "each outside picture's credit..."
 * 16. Printed, a picture or the navy veil over the band's picture prints, so the band's words lose their contrast
 *                                                                          -> "printed, the pictures..."
 * 17. A picture that fails to load (a dropped connection, a blocked request) leaves a broken-image frame
 *                                                                          -> "a picture that fails..."
 */
import type { Page } from "@playwright/test";

import { HOME, phraseText } from "../lib/home/copy";
import { contrastRatio } from "../lib/screening/contrast";
import { GUIDE } from "../lib/screening/copy/guide";

import { INCOMPLETE, ORDERED, expect, orderedRow, test, waitForMap } from "./screening-helpers";

const NAVY = "#002569";
const hexOf = (rgb: string) =>
  `#${(rgb.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, "0"))
    .join("")}`;

test("/ is the homepage, and its main button opens the list", async ({ page }) => {
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page).toHaveTitle(new RegExp(HOME.meta.title));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(phraseText(HOME.hero.title));

  await page.getByRole("main").getByRole("link", { name: HOME.open }).first().click();
  await waitForMap(page);
  expect(new URL(page.url()).pathname).toBe("/screening");
  await expect(page.locator(`${ORDERED} button`).first()).toBeVisible();
});

test("How it works moves to how the list is made, and the links into the tool open where they say", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: HOME.hero.how }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: HOME.method.title })).toBeInViewport();

  await page.getByRole("link", { name: HOME.hero.queueLink }).click();
  await waitForMap(page);
  await expect(page.locator(INCOMPLETE)).toBeVisible();

  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: HOME.footer.links.guides }).click();
  await expect(page.getByRole("heading", { name: GUIDE.startTitle })).toBeVisible();
});

test("an old link at / opens the tool with its query, as it did before the homepage", async ({
  page,
  request,
}) => {
  await page.goto("/?rule=additive_u");
  await waitForMap(page);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/screening");
  expect(url.search).toBe("?rule=additive_u");
  // A school that is in the list only under the rule the screen opens on is not there, so the view came from the link.
  await expect(orderedRow(page, "Sample School 01")).toHaveCount(1);
  await expect(orderedRow(page, "Sample School 23")).toHaveCount(0);

  // Every kind of state the tool keeps in its address goes on unchanged: a school, a province, a guide and its step.
  for (const query of [
    "?school=4e65114f0b8790b6b906088a6d549020&prov=Morobe",
    "?guide=q2&gstep=1",
    "?view=queue&q=High",
  ]) {
    const response = await request.get(`/${query}`, { maxRedirects: 0 });
    expect(response.status(), query).toBe(307);
    const to = new URL(response.headers()["location"], page.url());
    expect(`${to.pathname}${to.search}`, query).toBe(`/screening${query}`);
  }
});

test("a homepage link tagged by a sharing service stays on the homepage", async ({ page }) => {
  for (const query of ["?utm_source=newsletter&utm_medium=email", "?fbclid=IwAR0abc"]) {
    await page.goto(`/${query}`);
    expect(new URL(page.url()).pathname, query).toBe("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(phraseText(HOME.hero.title));
  }
});

test("no width from a small phone to a wide screen scrolls sideways", async ({ page }) => {
  for (const width of [1600, 1440, 1280, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.scrollingElement!.clientWidth,
    }));
    expect(scroll, `${width} px wide`).toBeLessThanOrEqual(client);
  }
});

test("one banner, one main and one footer, headings in order, and a keyboard way in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: HOME.footer.navLabel })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  for (const title of [HOME.scope.title, HOME.method.title, HOME.use.title, HOME.research.title])
    await expect(page.getByRole("region", { name: title }), title).toHaveCount(1);
  // The example row is a figure named by its caption, which says the school is made up.
  await expect(page.getByRole("figure", { name: HOME.use.example.caption })).toBeVisible();
  const levels = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) => headings.map((h) => Number(h.tagName.slice(1))));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i += 1)
    expect(levels[i], `heading ${i + 1}`).toBeLessThanOrEqual(levels[i - 1] + 1);

  // The first Tab offers the way past the masthead; it lands on the content, and the next Tab on its first button.
  const skip = page.getByRole("link", { name: HOME.skip });
  await expect(skip).not.toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("main").getByRole("link", { name: HOME.open }).first()).toBeFocused();

  // On the navy footer the focus ring is white: a navy ring there would not show.
  const footerLink = page.getByRole("contentinfo").getByRole("link").first();
  await footerLink.focus();
  const ring = await footerLink.evaluate((a) => ({
    style: getComputedStyle(a).outlineStyle,
    color: getComputedStyle(a).outlineColor,
  }));
  expect(ring.style).not.toBe("none");
  expect(contrastRatio(hexOf(ring.color), NAVY)).toBeGreaterThanOrEqual(3);
});

test("smooth scrolling runs only for a reader who has not asked for less motion", async ({ page }) => {
  const scrolling = () => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  expect(await scrolling()).toBe("smooth");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await scrolling()).toBe("auto");
});

test("printed, the navy band's words print dark on white paper, and the buttons are left off", async ({
  page,
}) => {
  await page.goto("/");
  await page.emulateMedia({ media: "print" });
  const statement = page.getByRole("heading", { level: 2, name: HOME.scope.title });
  const ink = await statement.evaluate((h) => getComputedStyle(h).color);
  expect(contrastRatio(hexOf(ink), "#ffffff")).toBeGreaterThanOrEqual(7);
  await expect(page.getByRole("main").getByRole("link", { name: HOME.open })).toHaveCount(0);
});

// The browser tests build the app before the mock API starts (npm run test:e2e), so the homepage they read was made
// with no API to answer, as a production build is when the API cannot be reached.
test("made while its API could not be reached, the page says the same things without numbers", async ({
  page,
}) => {
  await page.goto("/");
  // The card keeps its three rows, each naming its group where its number would be, so it reads as whole.
  const rows = page.getByTestId("home-figures").getByRole("listitem");
  await expect(rows).toHaveText(HOME.hero.noFigures.map((row) => `${row.term} ${row.text}`));
  for (const row of await rows.allTextContents()) expect(row).not.toMatch(/\d/);
  await expect(page.locator("body")).not.toContainText(/undefined|NaN|\bnull\b/);
});

test("the study section and the footer each give both contacts as mail links that show the full address", async ({
  page,
}) => {
  await page.goto("/");
  for (const area of [page.getByRole("region", { name: HOME.research.title }), page.getByRole("contentinfo")])
    for (const person of HOME.contact.people) {
      const link = area.getByRole("link", { name: person.email, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `mailto:${person.email}`);
    }
});

// Failure mode: search engines are given no rules, so the tool's many view addresses get indexed, or the homepage
// itself is shut out.
test("robots.txt lets search engines read the homepage and keeps the tool's views out", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const rules = await response.text();
  expect(rules).toMatch(/^Allow: \/$/m);
  for (const path of ["/screening", "/sign-in", "/auth/", "/api/"])
    expect(rules).toContain(`Disallow: ${path}`);
});

/** Scrolls the page to its foot a screen at a time, so every lazy picture comes near the screen and loads. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.scrollingElement!.scrollHeight);
  const step = page.viewportSize()!.height;
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(150);
  }
  await page.waitForLoadState("networkidle");
}

/** The pictures the layout shows, with whether each finished loading with pixels in it. */
const shownPictures = (page: Page) =>
  page
    .locator("img")
    .evaluateAll((images: HTMLImageElement[]) =>
      images
        .filter((img) => img.checkVisibility())
        .map((img) => ({ src: img.currentSrc, loaded: img.complete && img.naturalWidth > 0 }))
    );

// One visit per size, each in a fresh browser as a reader's own would be: a browser that has just shown the wide
// screen's larger copy of the hero picture uses it again and leaves the phone's preloaded copy unused.
for (const [width, height, shown] of [
  [1440, 900, 4],
  [390, 844, 3],
]) {
  test(`every picture the page shows loads, ${width} px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await scrollThrough(page);
    const pictures = await shownPictures(page);
    expect(pictures).toHaveLength(shown);
    for (const picture of pictures) expect(picture.loaded, picture.src).toBe(true);
  });
}

// The pictures by their files' names, which the resizer keeps in its address.
const PICTURE = { phone: /tool-phone/, map: /png-provinces/, tool: /tool-desktop/ };

test("a phone fetches the pictures it shows as the reader nears them, and never the one it hides", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fetched: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") fetched.push(decodeURIComponent(request.url()));
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(fetched.some((url) => PICTURE.tool.test(url))).toBe(true);
  // The map lies thousands of pixels down the page: it waits until the reader comes near it.
  expect(fetched.some((url) => PICTURE.map.test(url))).toBe(false);

  await scrollThrough(page);
  expect(fetched.some((url) => PICTURE.map.test(url))).toBe(true);
  // A phone shows the example row without the phone picture, so it never fetches that picture.
  expect(fetched.some((url) => PICTURE.phone.test(url))).toBe(false);
});

test("the screenshots are described, and the pictures that only decorate are not announced", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("figure", { name: HOME.images.caption })).toBeVisible();
  await expect(page.getByRole("img", { name: HOME.images.tool })).toBeVisible();
  await expect(page.getByRole("img", { name: HOME.images.phone })).toBeVisible();
  // The view from orbit, the province map and the notes' drawings are decoration: a screen reader meets only the
  // two screenshots in the main content.
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(2);
});

test("each outside picture's credit is in the footer, linked to its source", async ({ page }) => {
  await page.goto("/");
  const credits = page.getByRole("contentinfo").getByRole("list", { name: HOME.images.creditsLabel });
  for (const credit of HOME.images.credits) {
    const link = credits.getByRole("link", { name: credit.text, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", credit.href);
  }
});

test("printed, the pictures and the band's veil are left off, and the band's words print dark", async ({
  page,
}) => {
  await page.goto("/");
  await page.emulateMedia({ media: "print" });
  for (const picture of await page.locator("img").all()) await expect(picture).toBeHidden();
  const band = page.getByRole("region", { name: HOME.scope.title });
  expect(await band.evaluate((el) => getComputedStyle(el, "::before").display)).toBe("none");
  const lead = band.getByText(HOME.scope.lead);
  const ink = await lead.evaluate((el) => getComputedStyle(el).color);
  expect(contrastRatio(hexOf(ink), "#ffffff")).toBeGreaterThanOrEqual(4.5);
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`a picture that fails to load leaves no broken frame, ${width} px wide`, async ({
    page,
    problems,
  }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image" ? route.abort("blockedbyclient") : route.continue()
    );
    await page.goto("/");
    await scrollThrough(page);
    for (const picture of await page.locator("img").all()) await expect(picture).toBeHidden();
    // The hero's window keeps its caption, and its screenshot's place keeps its size.
    const frame = page.getByRole("figure", { name: HOME.images.caption });
    await expect(frame.getByText(HOME.images.caption)).toBeVisible();
    expect((await frame.boundingBox())!.height).toBeGreaterThan(140);
    // Every problem the browser reports is one of the refused pictures.
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem).toMatch(/BLOCKED_BY_CLIENT|requestfailed/);
    problems.length = 0;
  });
}
