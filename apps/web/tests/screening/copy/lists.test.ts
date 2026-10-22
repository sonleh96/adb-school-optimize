/**
 * Full copy records for every row of a list, from the bulk stored inputs and the lists of the rules.
 *
 * Failure modes, each with the test that catches it:
 *  1. A row's record differs from the same school's record built from its detail, so the list and the card disagree.
 *  2. A list is joined to inputs of another input version, or to a school the inputs do not hold, and the sentences
 *     quote the wrong school's readings.
 *  3. A reason, a missing-detail chip or a note throws or reads wrong for some row, because the record lacks a
 *     part the card has.
 *  4. A count that needs every record is stated from a filtered list, or for a rule whose own list holds no flags.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { countsFromResults, schoolFromDetail, schoolsFromLists } from "@/lib/screening/copy";
import { ParseError, parseWith } from "@/lib/screening/schema";
import { type ResultsResponse, inputsResponse, resultsResponse } from "@/lib/screening/types";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, RULES, fixtureDetail, fixtureResults, textProblems } from "./helpers";

const inputs = parseWith(inputsResponse, readFixture("inputs.json"), "inputs");
const lists = RULES.map((r) => fixtureResults(r));
const view: copy.CopyRuleId = "additive_u";
const schools = schoolsFromLists(inputs, lists, view);

describe("the records of a list", () => {
  it("has one for each row, in the list's order", () => {
    const shown = lists.find((l) => l.run.rule_id === view) as ResultsResponse;
    expect(schools.map((s) => s.id)).toEqual(shown.rows.map((r) => r.school.school_key));
    expect(schools).toHaveLength(25);
  });

  it.each([
    ["a complete school", KEYS.complete],
    ["a range school", KEYS.interval],
    ["a complete school with a range once the range schools count", KEYS.completeWithRange],
    ["a school held back", KEYS.queueTeacherHouses],
  ])("is the record the school's detail gives, for %s", (_label, key) => {
    for (const r of RULES) {
      const fromList = schoolsFromLists(inputs, lists, r).find((s) => s.id === key);
      expect(fromList, r).toEqual(schoolFromDetail(fixtureDetail(key), r));
    }
  });

  it("gives a reason, a place sentence and every input's note for every school under every rule", () => {
    for (const r of RULES) {
      const all = schoolsFromLists(inputs, lists, r);
      const P = copy.bindCopy({ view: r, inputs, lists }).copy;
      for (const s of all) {
        const tag = `${s.name} ${r}`;
        expect(
          textProblems(P.rankSentence(s, r, { name: true }), { schoolNames: [s.name as string] }),
          tag
        ).toEqual([]);
        if (s.cohort === "queue") {
          expect(copy.missingLabels(s).length, tag).toBeGreaterThan(0);
          for (const t of copy.missingSentences(s, "additive_u"))
            expect(textProblems(t, { schoolNames: [s.name as string] }), tag).toEqual([]);
          for (const k of copy.INPUT_KEYS) copy.missingValueNote(s, k);
        } else {
          expect(copy.topDrivers(s, r).length, tag).toBeGreaterThan(0);
          expect(textProblems(copy.reasonSentence(s, r), { schoolNames: [s.name as string] }), tag).toEqual(
            []
          );
          expect(copy.missingLabels(s), tag).toEqual([]);
        }
      }
    }
  });

  it("groups the schools held back by what is missing, with a label for each", () => {
    const held = schools.filter((s) => s.cohort === "queue");
    expect(held).toHaveLength(4);
    const groups = new Map<string, string[]>();
    for (const s of held) {
      const labels = copy.missingLabels(s);
      const key = labels.length === 1 ? labels[0] : `${labels.length} kinds`;
      groups.set(key, [...(groups.get(key) ?? []), s.name as string]);
    }
    expect([...groups.keys()].sort()).toEqual(
      [
        "4 kinds",
        "Remoteness off the scale, needs checking",
        "Teacher count blank",
        "Urgency rating not recorded",
      ].sort()
    );
  });
});

describe("a list joined to the wrong inputs", () => {
  it("is refused when the input versions differ", () => {
    const other = clone(inputs);
    (other as { input_version: string }).input_version = "another-version";
    expect(() => schoolsFromLists(other, lists, view)).toThrow(ParseError);
    expect(() => schoolsFromLists(other, lists, view)).toThrow(
      "is of input version synthetic-fixture-v1, not another-version"
    );
  });

  it("is refused when the inputs lack a school of the list", () => {
    const other = { ...inputs, schools: inputs.schools.slice(1) };
    expect(() => schoolsFromLists(other, lists, view)).toThrow(
      "inputs: there are no stored inputs for the school"
    );
  });

  it("is refused when there is no list for the rule shown", () => {
    expect(() => schoolsFromLists(inputs, lists.slice(1), "additive_u")).toThrow(
      "lists: there is no list for additive_u"
    );
  });
});

describe("the counts that need every record", () => {
  const shown = lists[RULES.indexOf(view)];
  const raw = readFixture("inputs.json") as { schools: { inputs: Record<string, number | null> }[] };

  it("are filled from the records of an unfiltered list", () => {
    const counts = countsFromResults(shown, schools);
    const placedStores = schools.filter((s) => s.cohort !== "queue");
    expect(counts.emissionsNone).toBe(placedStores.filter((s) => s.raw.E_raw === 0).length);
    expect(counts.remotenessOnly).toBe(
      schools.filter(
        (s) =>
          s.cohort === "queue" && copy.missingLabels(s)[0] === copy.TERMS.missing_all_but_remoteness.label
      ).length
    );
    expect(counts.flagged).toBe(shown.rows.filter((r) => r.persistent_candidate === true).length);
    expect(counts.flagged).toBeGreaterThan(0);
    // The figures come from the stored inputs, not from a second read of the list.
    expect(raw.schools).toHaveLength(25);
  });

  it("are left out without the records, with a filtered list, or for a rule with no flags of its own", () => {
    expect(countsFromResults(shown)).not.toHaveProperty("emissionsNone");
    expect(countsFromResults(shown)).not.toHaveProperty("flagged");
    const filtered = { ...shown, returned_schools: 10, rows: shown.rows.slice(0, 10) } as ResultsResponse;
    const some = schoolsFromLists(inputs, [filtered, ...lists.filter((l) => l !== shown)], view);
    const counts = countsFromResults(filtered, some);
    for (const k of ["emissionsNone", "remotenessOnly", "flagged", "airMissing"])
      expect(counts, k).not.toHaveProperty(k);
    const without = schoolsFromLists(
      inputs,
      lists.filter((l) => l.run.rule_id !== "additive_u"),
      "additive_no_u"
    );
    const revised = lists[RULES.indexOf("additive_no_u")];
    const plain = countsFromResults(revised, without);
    expect(plain).toHaveProperty("emissionsNone");
    // The flag count is the shown rule's own, from its own list, so the circulated list is not needed for it.
    expect(plain.flagged).toBe(revised.rows.filter((r) => r.persistent_candidate === true).length);
    // A list of a rule the test did not run for has no flag to count.
    const bottleneck = lists[RULES.indexOf("bottleneck_u")];
    const others = schoolsFromLists(inputs, lists, "bottleneck_u");
    expect(countsFromResults(bottleneck, others)).not.toHaveProperty("flagged");
  });

  it("let the help card state them", () => {
    const P = copy.bindCopy({ view, inputs, lists }).copy;
    expect(P.termsFor("additive_u").persistent_flag.help).toMatch(/schools? (has|have) the flag\./);
    expect(P.termsFor("additive_u").persistent_flag.help).not.toContain("Some schools have the flag.");
    // The unbound help names no count: a count belongs to one rule's test.
    expect(P.TERMS.persistent_flag.help).not.toMatch(/the flag\./);
  });
});

describe.each(["", "ties-and-ranges/", "worst-names/", "one/"])("the API's dataset %j", (dir) => {
  const have = (file: string) => {
    try {
      readFixture(`${dir}${file}`);
      return true;
    } catch {
      return false;
    }
  };
  const ruleLists = RULES.filter((r) => have(`results/${r}.json`)).map((r) =>
    parseWith(resultsResponse, readFixture(`${dir}results/${r}.json`), r)
  );
  const bulk = parseWith(inputsResponse, readFixture(`${dir}inputs.json`), "inputs");

  it("gives a record for every row of every rule, and says something clean about each", () => {
    expect(ruleLists.length).toBeGreaterThan(0);
    for (const l of ruleLists) {
      const r = l.run.rule_id as copy.CopyRuleId;
      const all = schoolsFromLists(bulk, ruleLists, r);
      expect(all).toHaveLength(l.rows.length);
      for (const s of all) {
        // A school's own name may hold a banned word ("Worst Case"), so the names are taken out before the guards run.
        const names = [...new Set(all.map((x) => x.name as string))].sort((x, y) => y.length - x.length);
        const bare = (t: string) => names.reduce((acc, n) => acc.split(n).join("Name"), t);
        const problems = [
          ...(s.cohort === "queue"
            ? copy.missingSentences(s, "additive_u")
            : [copy.reasonSentence(s, r), copy.rankSentence(s, r, { name: true })]),
          ...copy.missingLabels(s),
        ].flatMap((t) => textProblems(bare(t), { sentence: false }));
        expect(problems, `${s.name} ${r}`).toEqual([]);
      }
    }
  });
});

describe("a range row's one line of why", () => {
  const byName = (name: string) => schools.find((s) => s.name === name) as copy.CopySchool;
  const without = (s: copy.CopySchool, readings: ("aqi" | "emissions" | "land")[]): copy.CopySchool => ({
    ...s,
    missing_env: {
      aqi: readings.includes("aqi"),
      emissions: readings.includes("emissions"),
      land: readings.includes("land"),
    },
  });

  it("keeps the full note for the one reading a saved range school lacks", () => {
    const s = byName("Sample School 17");
    expect(copy.rangeRowWhy(s)).toBe(copy.missingValueNote(s, "air"));
  });

  it("names every reading a range school lacks when it lacks more than one", () => {
    const s = without(byName("Sample School 17"), ["aqi", "land"]);
    expect(copy.rangeRowWhy(s)).toBe(
      "Its air-quality reading and land-cover figure are missing, so the school shows a range of positions."
    );
    const all = without(byName("Sample School 17"), ["aqi", "emissions", "land"]);
    expect(copy.rangeRowWhy(all)).toBe(
      "Its air-quality reading, nearby emissions figure and land-cover figure are missing, so the school shows a range of positions."
    );
    expect(textProblems(copy.rangeRowWhy(all) as string)).toEqual([]);
  });

  it("has nothing to say for a school that lacks no reading", () => {
    expect(copy.rangeRowWhy(byName("Sample School 08"))).toBeNull();
  });
});
