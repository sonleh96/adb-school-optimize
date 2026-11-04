/**
 * The drawing of a school's top-20 frequency in each setting of a persistence test, in the method details
 * (components/screening/method/FrequencyTracks.tsx, from lib/screening/method/tracks.ts). It reads the API's own saved
 * responses, whose invented tests hold schools on both sides of the line and inside its band.
 *
 * Failure modes, each with the test that catches it:
 *  1. The drawing disagrees with the flag: a flagged school with a mark below the line, or an unflagged one with every
 *     mark at or above it                         -> "draws every mark at or above the line exactly when ..."
 *  2. A mark near the line is drawn outside the band it is in, or on the wrong side of the line
 *                                                 -> "draws a mark inside the band inside the band ..."
 *  3. A value's words round it to the other side of the line (0.7999 as "80%")
 *                                                 -> "words each value on the side of the line its mark is on"
 *  4. A frequency block that is null, missing or malformed throws, or draws something
 *                                                 -> "draws nothing, without error, from ..."
 *  5. The words a screen reader hears say another share or another side of the line than the mark
 *                                                 -> covered with 1 and 3: each row's words are read off the render
 *  6. A value just outside the band is rounded to a number inside the band's printed range ("79%" against
 *     "78.9% to 81.1%"), or one just inside it to a number outside
 *                                                 -> "states a number inside the printed band exactly when ..."
 *  7. "Share" means a share of runs in the figure's words and also the factors' weights in its labels
 *                                                 -> "names each setting in plain words with its concentrations"
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FrequencyTracks } from "@/components/screening/method/FrequencyTracks";
import {
  type BoundCopy,
  type CopySchool,
  bindCopy,
  schoolFromDetail,
  schoolsFromLists,
} from "@/lib/screening/copy";
import type { Method } from "@/lib/screening/copy/method";
import type { PersistenceRule } from "@/lib/screening/copy/model";
import { frequencyTracks, percentBeside } from "@/lib/screening/method/tracks";
import { parseWith } from "@/lib/screening/schema";
import { resultsResponse, schoolDetailResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "./fixtures";
import { RULES, fixtureInputs, fixtureResults } from "./copy/helpers";

const inputs = fixtureInputs();
const lists = RULES.map((r) => fixtureResults(r));
const TESTED: readonly PersistenceRule[] = ["additive_no_u", "additive_u"];

/** What the page draws for every school of the fixtures under `rule`, read off the rendered figure. */
interface Drawn {
  name: string;
  persistent: boolean;
  rows: { mark: number; words: string }[];
  line: number;
  band: { lo: number; hi: number } | null;
}

const at = (el: Element | null): number => Number((el as HTMLElement).style.getPropertyValue("--at"));

function drawnFor(method: Method, bound: BoundCopy, school: CopySchool, rule: PersistenceRule) {
  const test = bound.persistenceTest(rule);
  const drawing = frequencyTracks(test, school.persistence?.[rule]);
  if (!test || !drawing) return null;
  const { container, unmount } = render(
    <FrequencyTracks method={method} rule={bound.ruleShortName(rule)} test={test} drawing={drawing} />
  );
  const rows = [...container.querySelectorAll("li")].map((li) => ({
    mark: at(li.querySelector("[data-part=mark]")),
    words: li.textContent ?? "",
  }));
  const lines = [...container.querySelectorAll("[data-part=line]")].map(at);
  const bandEl = container.querySelector("[data-part=band]") as HTMLElement | null;
  const band = bandEl ? { lo: at(bandEl), hi: Number(bandEl.style.getPropertyValue("--to")) } : null;
  unmount();
  // One line, at the same place on every track.
  expect(new Set(lines).size).toBe(1);
  return { rows, line: lines[0], band };
}

async function everyDrawing(rule: PersistenceRule): Promise<Drawn[]> {
  const bound = bindCopy({ view: rule, inputs, lists }).copy;
  const method = await bound.methodFor(rule);
  return schoolsFromLists(inputs, lists, rule).flatMap((school) => {
    const drawn = drawnFor(method, bound, school, rule);
    return drawn
      ? [{ name: school.name ?? school.id, persistent: school.persistence![rule]!.persistent, ...drawn }]
      : [];
  });
}

describe.each(TESTED)("under %s", (rule) => {
  it("draws every mark at or above the line exactly when the school is flagged, and says the same in words", async () => {
    const drawn = await everyDrawing(rule);
    // Every school the test ran for is drawn, flagged or not.
    const withNumbers = fixtureResults(rule).rows.filter((r) => r.top20_frequencies);
    expect(drawn).toHaveLength(withNumbers.length);
    expect(drawn.some((d) => d.persistent)).toBe(true);
    expect(drawn.some((d) => !d.persistent)).toBe(true);
    for (const d of drawn) {
      expect(d.rows).toHaveLength(3);
      expect(
        d.rows.every((r) => r.mark >= d.line),
        d.name
      ).toBe(d.persistent);
      for (const r of d.rows) {
        const reaches = r.mark >= d.line;
        expect(r.words, d.name).toMatch(reaches ? /reaches the 80% line\.?$/ : /below the 80% line\.?$/);
        // The share the words state is the mark's, to the precision they state it.
        const stated = /(\d+(?:\.\d+)?)% of runs/.exec(r.words);
        expect(stated, r.words).not.toBeNull();
        const digits = stated![1].split(".")[1]?.length ?? 0;
        expect(Math.abs(Number(stated![1]) - r.mark * 100), r.words).toBeLessThanOrEqual(
          0.5 * 10 ** -digits + 1e-9
        );
      }
    }
  });

  it("draws nothing for a flag the frequencies contradict", () => {
    const bound = bindCopy({ view: rule, inputs, lists }).copy;
    const test = bound.persistenceTest(rule);
    const school = schoolsFromLists(inputs, lists, rule).find(
      (s) => s.persistence?.[rule]?.persistent && s.persistence[rule]!.frequencies
    );
    const flag = school!.persistence![rule]!;
    expect(frequencyTracks(test, flag)).not.toBeNull();
    expect(frequencyTracks(test, { ...flag, persistent: false })).toBeNull();
  });
});

describe("the band around the line", () => {
  it("draws a mark inside the band inside the band, and a mark outside it outside", async () => {
    // The revised test's band is two standard errors either side of 80%: 78.87% to 81.13%. Its fixtures hold 0.79
    // (inside, below the line) and 0.8105 (inside, above it).
    const drawn = await everyDrawing("additive_no_u");
    const marks = drawn.flatMap((d) => d.rows.map((r) => ({ ...r, band: d.band!, line: d.line })));
    const inside = marks.filter((m) => [0.79, 0.8105].includes(m.mark));
    expect(inside).toHaveLength(2);
    for (const m of marks) {
      expect(m.band.lo).toBeCloseTo(0.8 - 2 * 0.005656854249492379, 12);
      expect(m.band.hi).toBeCloseTo(0.8 + 2 * 0.005656854249492379, 12);
      const inBand = m.mark >= m.band.lo && m.mark <= m.band.hi;
      expect(inBand, m.words).toBe(Math.abs(m.mark - 0.8) <= 2 * 0.005656854249492379);
    }
    const below = inside.find((m) => m.mark === 0.79)!;
    expect(below.mark).toBeLessThan(below.line);
    // Inside the band, a value keeps a decimal, so a school just off the line does not read as on it.
    expect(below.words).toMatch(/\b79\.0% of runs, below the 80% line$/);
    const above = inside.find((m) => m.mark === 0.8105)!;
    expect(above.mark).toBeGreaterThanOrEqual(above.line);
    expect(above.words).toMatch(/\b81\.1% of runs, reaches the 80% line$/);
  });

  it("is one standard error either side under the circulated test", async () => {
    const drawn = await everyDrawing("additive_u");
    expect(drawn.length).toBeGreaterThan(0);
    for (const d of drawn) {
      expect(d.band!.lo).toBeCloseTo(0.8 - 0.005656854249492379, 12);
      expect(d.band!.hi).toBeCloseTo(0.8 + 0.005656854249492379, 12);
    }
  });
});

describe("the words beside each mark", () => {
  it("words each value on the side of the line its mark is on", async () => {
    // The circulated fixtures hold 0.7999, which rounds to 80% whole, and exactly 0.8, which reaches the line. Both are
    // inside the band, so they keep a decimal.
    const drawn = await everyDrawing("additive_u");
    const words = drawn.flatMap((d) => d.rows.map((r) => r.words));
    expect(words.some((w) => w.endsWith("79.99% of runs, below the 80% line"))).toBe(true);
    expect(words.some((w) => w.endsWith("80.0% of runs, reaches the 80% line"))).toBe(true);
    expect(percentBeside(0.7999, 0.8)).toBe("79.99%");
    expect(percentBeside(0.79996, 0.8)).toBe("79.996%");
    expect(percentBeside(0.8, 0.8)).toBe("80%");
    expect(percentBeside(0.818, 0.8)).toBe("82%");
    expect(percentBeside(0.7692, 0.8)).toBe("77%");
    // Within the band (here the circulated test's, one standard error), a decimal stays: the preview data's two
    // near-line schools under S are 0.8014 and 0.8034, which whole would both read as the line itself.
    const se = 0.005656854249492379;
    const band = (errors: number) => ({ lo: 0.8 - errors * se, hi: 0.8 + errors * se });
    expect(percentBeside(0.8014, 0.8, band(1))).toBe("80.1%");
    expect(percentBeside(0.8034, 0.8, band(1))).toBe("80.3%");
    expect(percentBeside(0.8, 0.8, band(1))).toBe("80.0%");
    expect(percentBeside(0.7999, 0.8, band(1))).toBe("79.99%");
    expect(percentBeside(0.8105, 0.8, band(2))).toBe("81.1%");
    expect(percentBeside(0.818, 0.8, band(1))).toBe("82%");
  });

  /** Each value's words for a school with these frequencies, under a test with S0's or S's band. */
  function wordsAt(frequencies: number[], errors: 1 | 2) {
    const se = 0.005656854249492379;
    const ids = ["concentration_20_15", "concentration_40_35", "concentration_100_80"];
    const test = {
      draws: 5000,
      threshold: 0.8,
      band: errors * se,
      settings: ids.map((id, i) => ({ id, topLevel: [20, 40, 100][i], schoolNeed: [15, 35, 80][i] })),
    };
    const flag = {
      persistent: frequencies.every((f) => f >= 0.8),
      adjacent: false,
      frequencies: frequencies.map((frequency, i) => ({ setting: ids[i], frequency })),
    };
    const drawing = frequencyTracks(test, flag)!;
    const band = drawing.band!;
    return {
      printed: [band.loPercent, band.hiPercent].map((p) => Number.parseFloat(p)) as [number, number],
      tracks: drawing.tracks.map((t) => ({
        frequency: t.frequency,
        inside: t.frequency >= band.lo && t.frequency <= band.hi,
        stated: Number.parseFloat(t.percent),
        percent: t.percent,
      })),
    };
  }

  it.each([
    // S0's band, two standard errors: 0.788686 to 0.811314, printed 78.9% to 81.1%. 0.7854 is real: an S0 school's
    // 40/35 frequency in the preview data, whose mark sits just outside the band.
    ["S0", 2, [0.7854, 0.7886, 0.7887], ["78.5%", "78.86%", "78.9%"]],
    ["S0", 2, [0.8113, 0.8114, 0.812], ["81.1%", "81.14%", "81.2%"]],
    ["S0", 2, [0.7849, 0.815, 0.8149], ["78%", "82%", "81.5%"]],
    // S's band, one standard error: 0.794343 to 0.805657, printed 79.4% to 80.6%.
    ["S", 1, [0.7943, 0.7944, 0.7935], ["79%", "79.4%", "79%"]],
    ["S", 1, [0.8056, 0.80566, 0.8064], ["80.6%", "81%", "81%"]],
    ["S", 1, [0.8052, 0.8017, 0.8], ["80.5%", "80.2%", "80.0%"]],
  ] as const)(
    "states a number inside the printed band exactly when the mark is inside it, at %s's band edges",
    (_, errors, frequencies, expected) => {
      const { printed, tracks } = wordsAt([...frequencies], errors);
      for (const t of tracks) {
        const statedInside = t.stated >= printed[0] && t.stated <= printed[1];
        expect(statedInside, `${t.frequency} as ${t.percent} against ${printed.join(" to ")}`).toBe(t.inside);
      }
      expect(tracks.map((t) => t.percent)).toEqual(expected);
    }
  );

  it("names each setting in plain words with its concentrations", async () => {
    const bound = bindCopy({ view: "additive_no_u", inputs, lists }).copy;
    const method = await bound.methodFor("additive_no_u");
    const school = schoolsFromLists(inputs, lists, "additive_no_u").find(
      (s) => s.persistence?.additive_no_u?.frequencies
    );
    const test = bound.persistenceTest("additive_no_u")!;
    const drawing = frequencyTracks(test, school!.persistence!.additive_no_u)!;
    const { container } = render(<FrequencyTracks method={method} rule="S0" test={test} drawing={drawing} />);
    expect([...container.querySelectorAll("li")].map((li) => li.firstElementChild!.textContent)).toEqual([
      "Shares changed a lot (20/15)",
      "Shares changed moderately (40/35)",
      "Shares changed a little (100/80)",
    ]);
  });
});

describe("a frequency block the page cannot draw", () => {
  const S0 = "additive_no_u";
  const raw = () =>
    clone(readFixture(`results/${S0}.json`)) as {
      rows: Record<string, unknown>[];
      persistence: Record<string, unknown>;
    };
  const flagged = (body: ReturnType<typeof raw>) =>
    body.rows.find((r) => r.persistent_candidate === true && r.top20_frequencies) as Record<string, unknown>;

  /** The page's chain from the saved response to the drawing, for the first flagged school, after `edit`. */
  function drawAfter(edit: (body: ReturnType<typeof raw>) => void) {
    const body = raw();
    const key = (flagged(body).school as { school_key: string }).school_key;
    edit(body);
    const list = parseWith(resultsResponse, body, "results");
    const others = lists.filter((l) => l.run.rule_id !== S0);
    const bound = bindCopy({ view: S0, inputs, lists: [list, ...others] }).copy;
    const school = schoolsFromLists(inputs, [list, ...others], S0).find((s) => s.id === key)!;
    return frequencyTracks(bound.persistenceTest(S0), school.persistence?.[S0]);
  }

  it("draws the unchanged response, so each case below is the edit's doing", () => {
    expect(drawAfter(() => {})).not.toBeNull();
  });

  it.each([
    ["null", (b: ReturnType<typeof raw>) => (flagged(b).top20_frequencies = null)],
    ["missing", (b: ReturnType<typeof raw>) => delete flagged(b).top20_frequencies],
    ["a string", (b: ReturnType<typeof raw>) => (flagged(b).top20_frequencies = "0.9")],
    [
      "an entry without a setting",
      (b: ReturnType<typeof raw>) => (flagged(b).top20_frequencies = [{ frequency: 0.9 }]),
    ],
    [
      "a share above 1",
      (b: ReturnType<typeof raw>) =>
        ((flagged(b).top20_frequencies as { frequency: number }[])[0].frequency = 1.2),
    ],
    [
      "a setting the test does not have",
      (b: ReturnType<typeof raw>) =>
        ((flagged(b).top20_frequencies as { setting_id: string }[])[0].setting_id = "concentration_1_1"),
    ],
    ["one setting short", (b: ReturnType<typeof raw>) => (flagged(b).top20_frequencies as unknown[]).pop()],
    [
      "no test block",
      (b: ReturnType<typeof raw>) => (b.persistence = null as unknown as Record<string, unknown>),
    ],
    ["a test without a threshold", (b: ReturnType<typeof raw>) => delete b.persistence.threshold],
  ])("draws nothing, without error, from %s", (_, edit) => {
    expect(drawAfter(edit)).toBeNull();
  });

  it("draws nothing from a school's detail whose frequencies are malformed, and still reads the flag", () => {
    const key = (flagged(raw()).school as { school_key: string }).school_key;
    const body = clone(readFixture(`schools/${key}.json`)) as { rules: Record<string, unknown>[] };
    const entry = body.rules.find((e) => (e.rule as { rule_id: string }).rule_id === S0)!;
    entry.top20_frequencies = [{ setting_id: 3, frequency: "high" }];
    const school = schoolFromDetail(parseWith(schoolDetailResponse, body, "school"), S0);
    expect(school.persistence?.[S0]?.persistent).toBe(true);
    const bound = bindCopy({ view: S0, inputs, lists }).copy;
    expect(frequencyTracks(bound.persistenceTest(S0), school.persistence?.[S0])).toBeNull();
  });
});
