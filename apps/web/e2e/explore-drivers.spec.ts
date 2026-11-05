/**
 * The explore page's section on what puts a school in the top 20: a bar per school split into what each part adds to
 * its score, and a ladder of the gaps between neighbouring ranks. Failure modes, each with the test that catches it:
 *  1. A bar's parts do not add up to the school's score within a billionth, or the bar is drawn longer or shorter
 *                                        -> "every bar ends at its school's score ..."
 *  2. The parts sit in another order, or wear other names or colours, than the diagram of each part's share
 *                                        -> "orders and names the parts as the score diagram does ..."
 *  3. A range school is drawn as a point
 *                                        -> "a range school's bar runs from its lower score to its upper ..."
 *  4. Float noise reads as a gap, a tie reads as a gap, or a close call as a tie
 *                                        -> "a tie reads as a tie, float noise included ..."
 *  5. A rule whose score is not its parts added up gets bars
 *                                        -> "a rule whose score is not its parts added up says why ..."
 *  6. The picked school is not marked, or one outside the top 20 is not drawn
 *                                        -> "marks the picked school in both charts ..."
 *  7. On a 390 or 360 px phone the page scrolls sideways, or a bar or a label leaves its card
 *                                        -> "fits a 390 and a 360 px phone ..."
 *  8. The table says other figures than the bars draw
 *                                        -> "the table says what the bars draw"
 *  9. The switch shows another list than the one with urgency, loses the main list, or never recovers from a failed
 *     read                               -> "the switch shows the list with urgency ..." and
 *                                           "keeps the main list while the other loads, and recovers ..."
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { DRIVERS } from "../lib/screening/copy/explore-drivers";
import { EXPLORE } from "../lib/screening/copy/explore";
import { LAYOUT } from "../lib/screening/copy/words";

import { type MockDataset, expect, openWorkspace, test, useMockDataset } from "./screening-helpers";

test.describe.configure({ timeout: 60_000 });

const FIXTURES = path.resolve(__dirname, "fixtures/screening");
const read = (dataset: MockDataset, file: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, dataset === "default" ? "" : dataset, file), "utf8"));

interface Row {
  cohort: string;
  school: { school_key: string; source_school_name: string };
  scores: { lower: number | null; upper: number | null; point: number | null };
  point_rank: { rank: number | null };
  rank_bounds: { best: number | null; worst: number | null };
  contributions: { component: string; lower: number; upper: number }[];
  need_part_contributions: Record<string, number | null> | null;
}
const rowsOf = (dataset: MockDataset, rule = "additive_no_u"): Row[] =>
  read(dataset, `results/${rule}.json`).rows;
const named = (rows: Row[], name: string) => rows.find((r) => r.school.source_school_name === name)!;
/** The top 20 as the paper cuts it: a rank of 20th or above, or a range of ranks whose highest is. */
const topOf = (rows: Row[]) =>
  rows.filter(
    (r) =>
      (r.cohort === "complete" && r.point_rank.rank! <= 20) ||
      (r.cohort === "interval" && r.rank_bounds.best! <= 20)
  );
/** What a part adds in the API's own response: a part of school need, or another input, at either end. */
const addsOf = (row: Row, piece: string) =>
  piece in (row.need_part_contributions ?? {})
    ? { lower: row.need_part_contributions![piece]!, upper: row.need_part_contributions![piece]! }
    : row.contributions.find((c) => c.component === piece)!;
const f3 = (value: number) => value.toFixed(3);

const section = (page: Page) => page.locator("[data-region=drivers]");

async function openDrivers(page: Page, search = "") {
  await page.goto(`/explore${search}`);
  await expect(section(page).locator("[data-region=bars] > li").first()).toBeVisible({ timeout: 30_000 });
}

interface DrawnBar {
  key: string;
  marked: boolean;
  lower: number;
  upper: number;
  rank: string;
  name: string;
  score: string;
  max: number;
  track: { left: number; right: number; width: number };
  segments: { piece: string; open: boolean; adds: number; left: number; width: number; colour: string }[];
}

/** Each bar as the page draws it: its words, its scale and every part, with where it sits and its colour. */
async function barsOf(list: Locator): Promise<DrawnBar[]> {
  return list.evaluate((ol) =>
    Array.from(ol.children).map((li) => {
      const [rank, name, track, score] = Array.from(li.children) as HTMLElement[];
      const box = track.getBoundingClientRect();
      return {
        key: li.getAttribute("data-school-key")!,
        marked: li.hasAttribute("data-marked"),
        lower: Number(li.getAttribute("data-lower")),
        upper: Number(li.getAttribute("data-upper")),
        rank: rank.textContent!.trim(),
        name: name.textContent!.trim(),
        score: score.textContent!.trim(),
        max: Number(ol.getAttribute("data-max")),
        track: { left: box.left, right: box.right, width: box.width },
        segments: Array.from(track.children).map((s) => {
          const r = s.getBoundingClientRect();
          return {
            piece: s.getAttribute("data-piece")!,
            open: s.hasAttribute("data-open"),
            adds: Number(s.getAttribute("data-adds")),
            left: r.left,
            width: r.width,
            colour: getComputedStyle(s).backgroundColor,
          };
        }),
      };
    })
  );
}

/** The ladder's rows as a reader sees them: the pair, the gap in words, and whether a bar is drawn. */
async function ladderOf(page: Page) {
  return section(page)
    .locator("[data-region=gaps] > li")
    .evaluateAll((items) =>
      items.map((li) => ({
        kind: li.getAttribute("data-kind")!,
        edge: li.hasAttribute("data-edge"),
        marked: li.hasAttribute("data-marked"),
        size: Number(li.getAttribute("data-size")),
        pair: li.children[0].childNodes[0].textContent!.trim(),
        gap: li.children[2].textContent!.trim(),
        bar: li.children[1].querySelector("span[style]") !== null,
      }))
    );
}

test("every bar ends at its school's score: its parts add up within a billionth, and its length is the score's", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "drivers");
  await openDrivers(page);
  const rows = rowsOf("drivers");
  const bars = await barsOf(section(page).locator("[data-region=bars]"));
  expect(bars.map((b) => b.key)).toEqual(topOf(rows).map((r) => r.school.school_key));
  for (const bar of bars) {
    const row = rows.find((r) => r.school.school_key === bar.key)!;
    // The parts drawn add up to the score the engine recorded, as the API sent it.
    const drawn = bar.segments.reduce((total, s) => total + s.adds, 0);
    expect(Math.abs(drawn - row.scores.upper!), bar.name).toBeLessThan(1e-9);
    const solid = bar.segments.filter((s) => !s.open).reduce((total, s) => total + s.adds, 0);
    expect(Math.abs(solid - row.scores.lower!), bar.name).toBeLessThan(1e-9);
    // And the bar is as long as its score on the scale: it starts at 0 and ends where the score sits, to a pixel.
    const pixels = bar.segments.reduce((total, s) => total + s.width, 0);
    expect(Math.abs(bar.segments[0].left - bar.track.left), bar.name).toBeLessThanOrEqual(0.5);
    expect(Math.abs(pixels - (row.scores.upper! / bar.max) * bar.track.width), bar.name).toBeLessThanOrEqual(
      1
    );
    expect(bar.score, bar.name).toBe(
      row.cohort === "complete"
        ? f3(row.scores.point!)
        : LAYOUT.valueRange(f3(row.scores.lower!), f3(row.scores.upper!))
    );
  }
  // The scale reaches the longest bar.
  expect(bars[0].max).toBeGreaterThanOrEqual(Math.max(...bars.map((b) => b.upper)));
});

test("orders and names the parts as the score diagram does, and colours each as its key", async ({
  page,
}) => {
  // The diagram of each part's share, in How this works, as a reader sees it: its innermost items in order.
  await openWorkspace(page, "?page=how");
  const diagram = page
    .getByRole("main", { name: "How this works" })
    .locator("section[data-key=rules]")
    .getByRole("figure", { name: /^How much each part counts/ });
  const leaves = await diagram.evaluate((figure) => {
    const nameOf = (li: Element) =>
      li.firstElementChild!.firstElementChild!.firstElementChild!.textContent!.trim();
    return Array.from(figure.querySelectorAll(":scope > ul > li")).flatMap((item) => {
      const inner = item.querySelectorAll(":scope > ul > li");
      return inner.length > 0 ? Array.from(inner).map(nameOf) : [nameOf(item)];
    });
  });
  expect(leaves).toHaveLength(10);

  await openDrivers(page);
  const legend = section(page).locator("[data-region=drivers-legend]");
  // Its five parts of school need, each with a key of its own, then one key for the other inputs, named in order.
  const need = await legend
    .locator("li[data-piece-key]")
    .evaluateAll((items) =>
      items
        .filter((li) => !/ |^open$/.test(li.getAttribute("data-piece-key")!))
        .map((li) => li.textContent!.trim())
    );
  expect(need).toEqual(leaves.slice(0, 5));
  await expect(legend).toContainText(DRIVERS.bars.others(leaves.slice(5)));

  // The table's columns are the diagram's parts in its order.
  await section(page).getByRole("button", { name: EXPLORE.table.show }).click();
  const columns = await section(page).locator("table thead th").allTextContents();
  expect(columns.slice(2, -1)).toEqual(leaves);

  // In every bar the parts sit in that order, the recorded ones first, and each wears its key's colour.
  const swatches = await legend
    .locator("li[data-piece-key]")
    .evaluateAll((items) =>
      Object.fromEntries(
        items.map((li) => [
          li.getAttribute("data-piece-key"),
          getComputedStyle(li.querySelector("span")!).backgroundColor,
        ])
      )
    );
  const order = (await section(page)
    .locator("table thead th[data-piece-key]")
    .evaluateAll((ths) => ths.map((th) => th.getAttribute("data-piece-key")!))) as string[];
  const otherKey = Object.keys(swatches).find((k) => k.includes(" "))!;
  for (const bar of await barsOf(section(page).locator("[data-region=bars]"))) {
    const solid = bar.segments.filter((s) => !s.open).map((s) => order.indexOf(s.piece));
    expect(solid, bar.name).toEqual([...solid].sort((a, b) => a - b));
    for (const s of bar.segments.filter((x) => !x.open))
      expect(s.colour, `${bar.name} ${s.piece}`).toBe(swatches[s.piece] ?? swatches[otherKey]);
  }
});

test("a range school's bar runs from its lower score to its upper, its blank figure hollow at the end", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "drivers");
  await openDrivers(page);
  const row = named(rowsOf("drivers"), "Range Air");
  const bar = (await barsOf(section(page).locator("[data-region=bars]"))).find(
    (b) => b.key === row.school.school_key
  )!;
  expect(row.cohort).toBe("interval");
  expect(bar.rank).toBe(`${row.rank_bounds.best}th to ${row.rank_bounds.worst}th`);
  expect(bar.score).toBe(LAYOUT.valueRange(f3(row.scores.lower!), f3(row.scores.upper!)));
  // The air-quality figure is blank: it is the last part, hollow, and as long as the most it could add.
  const last = bar.segments.at(-1)!;
  expect(last).toMatchObject({ piece: "Q", open: true });
  expect(bar.segments.filter((s) => s.open)).toHaveLength(1);
  const q = addsOf(row, "Q");
  expect(Math.abs(last.adds - (q.upper - q.lower))).toBeLessThan(1e-9);
  const solidEnd = last.left;
  const scale = (score: number) => bar.track.left + (score / bar.max) * bar.track.width;
  expect(Math.abs(solidEnd - scale(row.scores.lower!))).toBeLessThanOrEqual(1);
  expect(Math.abs(last.left + last.width - scale(row.scores.upper!))).toBeLessThanOrEqual(1);
  // The legend says what the hollow part is.
  await expect(section(page).locator("[data-region=drivers-legend]")).toContainText(DRIVERS.bars.unrecorded);
});

test("a tie reads as a tie, float noise included, and a close call as a close call", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "drivers");
  await openDrivers(page);
  const rows = rowsOf("drivers");
  const score = (name: string) => named(rows, name).scores.point!;
  // The engine's own figures: one exact tie, and one tie split only by floating point.
  expect(score("Level Alpha")).toBe(score("Level Bravo"));
  expect(score("Noise Solar")).not.toBe(score("Noise Generator"));
  expect(Math.abs(score("Noise Solar") - score("Noise Generator"))).toBeLessThan(1e-12);

  const ladder = await ladderOf(page);
  expect(ladder).toHaveLength(21);
  const at = (above: string, below: string) => {
    const pair = DRIVERS.gaps.pair(named(rows, above).point_rank.rank!, named(rows, below).point_rank.rank!);
    return ladder.find((step) => step.pair === pair)!;
  };
  for (const [above, below] of [
    ["Level Alpha", "Level Bravo"],
    ["Noise Solar", "Noise Generator"],
  ])
    expect(at(above, below), `${above} and ${below}`).toMatchObject({
      kind: "tie",
      gap: DRIVERS.gaps.tie,
      bar: false,
    });
  expect(at("Close Two", "Close One")).toMatchObject({ kind: "close", gap: DRIVERS.gaps.close, bar: true });
  // Every other gap is written to three decimals, and is as wide as it is.
  for (const step of ladder.filter((s) => s.kind === "clear")) expect(step.gap).toBe(f3(step.size));
  const words = section(page).locator("[data-figure=gaps]");
  await expect(words.locator("[data-region=gap-line]")).toHaveText(
    `${DRIVERS.gaps.line(2, ladder.filter((s) => s.kind === "close").length)} ${DRIVERS.gaps.edge(f3(ladder.find((s) => s.edge)!.size))}`
  );
  await expect(words).toContainText(DRIVERS.gaps.tieNote);
  await expect(words).toContainText(DRIVERS.gaps.roundingNote);
  // The edge of the top 20 is the gap between the 20th and the 21st.
  expect(ladder.find((s) => s.edge)!.pair).toBe(DRIVERS.gaps.pair(20, 21));

  // In a list with no tie split by floating point, the note on rounding is not said.
  await useMockDataset(context, "ties-and-ranges");
  await openDrivers(page);
  await expect(section(page).locator("[data-region=gaps] > li[data-kind=tie]").first()).toBeVisible();
  await expect(section(page)).not.toContainText(DRIVERS.gaps.roundingNote);
});

test("a rule whose score is not its parts added up says why in one sentence, and draws no bars", async ({
  page,
}) => {
  for (const [rule, sentence] of [
    ["need_first_no_u", DRIVERS.notDrawn.needFirst("school need alone")],
    ["bottleneck_no_u", DRIVERS.notDrawn.largest("x", ["School need", "District context"])],
  ] as const) {
    // The rules as an API without the main rule would send them, so the page shows this rule's list.
    await page.unrouteAll();
    await page.route("**/api/v1/screening/rules", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.rules = body.rules.filter((r: { rule_id: string }) => r.rule_id !== "additive_no_u");
      body.default_rule_id = rule;
      await route.fulfill({ response, json: body });
    });
    await page.goto("/explore");
    const drivers = section(page);
    await expect(drivers).toBeVisible({ timeout: 30_000 });
    await expect(drivers.locator("[data-rule]").first()).toHaveAttribute("data-rule", rule);
    // One sentence, the rule's own, and nothing drawn: no bars, no gaps, no switch.
    const said = (await drivers.locator("p").first().textContent())!;
    expect(said.endsWith(sentence.slice(sentence.indexOf(","))), said).toBe(true);
    await expect(drivers.locator("[data-region=bars], [data-region=gaps], figure, fieldset")).toHaveCount(0);
  }
});

test("marks the picked school in both charts, and draws one outside the top 20 on its own", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "drivers");
  const rows = rowsOf("drivers");
  const close = named(rows, "Close One");
  await openDrivers(page, `?school=${close.school.school_key}`);
  const marked = section(page).locator("[data-region=bars] > li[data-marked]");
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("data-school-key", close.school.school_key);
  const rank = close.point_rank.rank!;
  const steps = (await ladderOf(page)).filter((s) => s.marked).map((s) => s.pair);
  expect(steps).toEqual([DRIVERS.gaps.pair(rank - 1, rank), DRIVERS.gaps.pair(rank, rank + 1)]);
  await expect(section(page).locator("[data-region=marked-lines]")).toContainText(
    close.school.source_school_name
  );
  await expect(section(page).locator("[data-region=outside]")).toHaveCount(0);

  // Picked from the page's own control: a school ranked 24th is drawn under the top 20, on the same scale.
  const far = rows.find((r) => r.point_rank.rank === 24)!;
  await page.getByLabel(EXPLORE.pick.label).selectOption(far.school.school_key);
  const outside = await barsOf(section(page).locator("[data-region=outside]"));
  expect(outside).toHaveLength(1);
  expect(outside[0]).toMatchObject({ key: far.school.school_key, marked: true, rank: "24th" });
  expect(outside[0].score).toBe(f3(far.scores.point!));
  await expect(section(page).locator("[data-region=bars] > li[data-marked]")).toHaveCount(0);
  await expect(section(page).getByText(DRIVERS.bars.outside)).toBeVisible();

  await page.getByLabel(EXPLORE.pick.label).selectOption("");
  await expect(section(page).locator("[data-marked]")).toHaveCount(0);
  await expect(section(page).locator("[data-region=outside], [data-region=marked-lines]")).toHaveCount(0);
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`fits a ${size.width} px phone with a school outside the top 20 marked and the table open`, async ({
    page,
    context,
  }) => {
    await useMockDataset(context, "drivers");
    await page.setViewportSize(size);
    const far = rowsOf("drivers").find((r) => r.point_rank.rank === 24)!;
    await openDrivers(page, `?school=${far.school.school_key}`);
    await section(page).getByRole("button", { name: EXPLORE.table.show }).click();
    await expect(section(page).locator("table")).toBeVisible();
    const sideways = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(sideways).toBeLessThanOrEqual(0);
    for (const figure of await section(page).locator("figure").all()) {
      const card = (await figure.boundingBox())!;
      const boxes = await figure.locator("li *, p, h3, button, legend").evaluateAll((els) =>
        els
          .filter((el) => !el.closest("[role=region]"))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, text: (el.textContent ?? "").slice(0, 30) };
          })
      );
      for (const box of boxes) {
        expect(box.left, box.text).toBeGreaterThanOrEqual(card.x - 0.5);
        expect(box.right, box.text).toBeLessThanOrEqual(card.x + card.width + 0.5);
      }
    }
    // The table is wider than the phone: it scrolls inside its own region, which a keyboard can reach.
    const region = section(page).getByRole("region");
    await expect(region).toHaveAttribute("tabindex", "0");
    const inside = await region.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(inside.scroll).toBeGreaterThan(inside.client);
  });

test("the table says what the bars draw", async ({ page, context }) => {
  await useMockDataset(context, "drivers");
  const rows = rowsOf("drivers");
  const far = rows.find((r) => r.point_rank.rank === 24)!;
  await openDrivers(page, `?school=${far.school.school_key}`);
  const bars = [
    ...(await barsOf(section(page).locator("[data-region=bars]"))),
    ...(await barsOf(section(page).locator("[data-region=outside]"))),
  ];
  await section(page).getByRole("button", { name: EXPLORE.table.show }).click();
  const table = section(page).getByRole("table", { name: /^What each part adds to each score under / });
  const pieces = await table
    .locator("thead th[data-piece-key]")
    .evaluateAll((ths) => ths.map((th) => th.getAttribute("data-piece-key")!));
  const body = await table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      key: tr.getAttribute("data-school-key")!,
      marked: tr.hasAttribute("data-marked"),
      cells: Array.from(tr.children).map((c) => c.textContent!.trim()),
    }))
  );
  expect(body.map((r) => r.key)).toEqual(bars.map((b) => b.key));
  for (const [i, tr] of body.entries()) {
    const bar = bars[i];
    const row = rows.find((r) => r.school.school_key === tr.key)!;
    expect(tr.cells[0], bar.name).toBe(bar.rank);
    expect(tr.cells[1], bar.name).toBe(bar.name);
    expect(tr.cells.at(-1), bar.name).toBe(bar.score);
    expect(tr.marked, bar.name).toBe(bar.marked);
    for (const [j, piece] of pieces.entries()) {
      const { lower, upper } = addsOf(row, piece);
      const words = lower === upper ? f3(lower) : LAYOUT.valueRange(lower === 0 ? "0" : f3(lower), f3(upper));
      expect(tr.cells[2 + j], `${bar.name} ${piece}`).toBe(words);
      // The bar draws the same: a recorded part as wide as it adds, a blank one hollow as far as it could.
      const solid = bar.segments.find((s) => s.piece === piece && !s.open)?.adds ?? 0;
      const open = bar.segments.find((s) => s.piece === piece && s.open)?.adds ?? 0;
      expect(Math.abs(solid - lower), `${bar.name} ${piece}`).toBeLessThan(1e-9);
      expect(Math.abs(open - (upper - lower)), `${bar.name} ${piece}`).toBeLessThan(1e-9);
    }
  }
});

test("the switch shows the list with urgency, with urgency's own part, and goes back", async ({
  page,
  context,
}) => {
  await useMockDataset(context, "drivers");
  await openDrivers(page);
  const urgency = rowsOf("drivers", "additive_u");
  await section(page).getByRole("radio", { name: DRIVERS.rules.urgency }).check();
  await expect(section(page).locator("[data-rule]").first()).toHaveAttribute("data-rule", "additive_u");
  await expect(section(page).locator("[data-region=bars]")).toBeVisible();
  const bars = await barsOf(section(page).locator("[data-region=bars]"));
  expect(bars.map((b) => b.key)).toEqual(topOf(urgency).map((r) => r.school.school_key));
  expect(bars.some((b) => b.segments.some((s) => s.piece === "U"))).toBe(true);
  for (const bar of bars) {
    const row = urgency.find((r) => r.school.school_key === bar.key)!;
    expect(Math.abs(bar.segments.reduce((t, s) => t + s.adds, 0) - row.scores.upper!)).toBeLessThan(1e-9);
  }
  await expect(section(page).getByRole("radio", { name: DRIVERS.rules.urgency })).toBeChecked();

  await section(page).getByRole("radio", { name: DRIVERS.rules.main }).check();
  await expect(section(page).locator("[data-rule]").first()).toHaveAttribute("data-rule", "additive_no_u");
  const back = await barsOf(section(page).locator("[data-region=bars]"));
  expect(back.map((b) => b.key)).toEqual(topOf(rowsOf("drivers")).map((r) => r.school.school_key));
});

test("keeps the main list while the other loads, and recovers from a failed read", async ({
  page,
  context,
  problems,
}) => {
  await useMockDataset(context, "drivers");
  let fail = true;
  const urgencyList = (url: URL) =>
    url.pathname.endsWith("/screening/results") && url.searchParams.get("rule") === "additive_u";
  await page.route(urgencyList, async (route) => {
    if (fail) return route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "x" } } });
    return route.continue();
  });
  await openDrivers(page);
  const before = await section(page).locator("[data-region=bars] > li").count();
  await section(page).getByRole("radio", { name: DRIVERS.rules.urgency }).check();
  const alert = section(page).getByRole("alert");
  await expect(alert).toContainText(LAYOUT.loadFailed, { timeout: 30_000 });
  // The main list's bars stay where they were, marked as waiting, so nothing jumps.
  await expect(section(page).locator("[data-region=bars] > li")).toHaveCount(before);
  await expect(section(page).locator("[aria-busy=true]").first()).toBeVisible();
  problems.length = 0;

  fail = false;
  await alert.getByRole("button", { name: LAYOUT.retry }).click();
  await expect(section(page).locator("[data-rule]").first()).toHaveAttribute("data-rule", "additive_u");
  await expect(section(page).getByRole("alert")).toHaveCount(0);
  await expect(section(page).locator("[aria-busy=true]")).toHaveCount(0);
});
