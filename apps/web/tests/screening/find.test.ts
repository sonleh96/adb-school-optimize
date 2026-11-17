/**
 * The find control's filter and state: a province, a district in it, and part of a school's name. Failure modes:
 *  1. The name search misses a school because of case, accents or extra spaces, or matches on its province instead
 *     of its name.
 *  2. A district from another province, or a district with no province, stays in force, so the list is empty for no
 *     reason the screen shows.
 *  3. The district choices are not the chosen province's, or a blank district becomes a choice.
 *  4. A filter set on the plain screen is lost from the address, or a link that carries one does not open on it, so a
 *     copied link or a saved view shows another list.
 *  5. A province or district the data does not hold, from a pasted link, stays in force and empties the list.
 *  6. Turning the method details off clears the find control's filter too, or keeps the method-only ones.
 *  7. Clearing the name search leaves the last letter behind.
 */
import { describe, expect, it } from "vitest";

import { admits, filterOptions, NO_FILTERS } from "@/lib/screening/filters";
import type { RuleId } from "@/lib/screening/types";
import {
  DEFAULT_STATE,
  type Known,
  applyPatch,
  revalidate,
  searchWithState,
  stateFromSearch,
} from "@/lib/screening/workspace/state";

import { copy, results } from "./fixtures";

const rows = results("additive_no_u").rows;
const named = (name: string) => rows.find((r) => r.school.source_school_name === name)!;

describe("the name search (1)", () => {
  const find = (q: string) =>
    rows.filter((r) => admits(r, { ...NO_FILTERS, q })).map((r) => r.school.source_school_name);

  it("finds a school by part of its name, whatever the case, accents and spaces", () => {
    expect(find("school 08")).toEqual(["Sample School 08"]);
    expect(find("  SAMPLE   school 08 ")).toEqual(["Sample School 08"]);
    expect(find("cafe")).toEqual(["Café Sample 20"]);
    expect(find("CAFÉ")).toEqual(["Café Sample 20"]);
  });

  it("reads only the name, and nothing typed means no filter", () => {
    expect(find("South Province")).toEqual([]);
    expect(find("   ")).toHaveLength(rows.length);
  });
});

describe("the province and district (2, 3)", () => {
  it("keeps exactly the rows of the district asked for", () => {
    const south = rows.filter((r) => admits(r, { ...NO_FILTERS, prov: "South Province" }));
    const southOne = rows.filter((r) =>
      admits(r, { ...NO_FILTERS, prov: "South Province", dist: "South One" })
    );
    expect(southOne.length).toBeGreaterThan(0);
    expect(southOne.length).toBeLessThan(south.length);
    expect(southOne.every((r) => r.school.district === "South One")).toBe(true);
  });

  it("offers each province's own districts, once, in order, and no blank", () => {
    const blank = copy(named("Sample School 01"));
    blank.school.district = " ";
    const { provinces, places } = filterOptions([...rows, blank]);
    expect(provinces).toEqual(["East Province", "North Province", "South Province"]);
    expect(places.get("North Province")).toEqual(["North One", "North Two"]);
    expect(places.get("South Province")).toEqual(["South One", "South Two"]);
    expect(places.get("East Province")).toEqual(["East One"]);
  });
});

const S = "additive_no_u" as RuleId;
const { places } = filterOptions(rows);
const loaded: Known = { ruleIds: new Set([S]), defaultRule: S, schoolKeys: null, places };
const loading: Known = { ruleIds: null, defaultRule: S, schoolKeys: null };

describe("the find control's state", () => {
  it("drops a district without its province, or under another province (2)", () => {
    const south = applyPatch(DEFAULT_STATE, { prov: "South Province", dist: "South One" }, loaded);
    expect(south).toMatchObject({ prov: "South Province", dist: "South One" });
    expect(applyPatch(south, { prov: "North Province" }, loaded)).toMatchObject({
      prov: "North Province",
      dist: null,
    });
    expect(applyPatch(south, { prov: null }, loaded)).toMatchObject({ prov: null, dist: null });
    expect(stateFromSearch("?dist=South%20One", loaded).dist).toBeNull();
  });

  it("writes the province, district and name into the address and reads them back, on a plain screen (4)", () => {
    const state = applyPatch(
      DEFAULT_STATE,
      { prov: "South Province", dist: "South One", q: "sample 0" },
      loaded
    );
    const search = searchWithState("", state);
    expect(search).toBe("?prov=South+Province&dist=South+One&q=sample+0");
    expect(stateFromSearch(search, loaded)).toEqual(state);
    expect(state.analyst).toBe(false);
  });

  it("drops a province or district the data does not hold once the data is known (5)", () => {
    const pasted = stateFromSearch("?prov=West%20Province&dist=West%20One&q=x", loading);
    expect(pasted).toMatchObject({ prov: "West Province", dist: "West One", q: "x" });
    expect(revalidate(pasted, loaded)).toMatchObject({ prov: null, dist: null, q: "x" });
    const unknownDistrict = stateFromSearch("?prov=South%20Province&dist=Nowhere", loading);
    expect(revalidate(unknownDistrict, loaded)).toMatchObject({ prov: "South Province", dist: null });
  });

  it("keeps the find control's filter when the method details go off, and drops theirs (6)", () => {
    const on = applyPatch(
      DEFAULT_STATE,
      { analyst: true, prov: "South Province", dist: "South Two", q: "08", loc: "Remote" },
      { ...loaded, localities: new Set(["Remote"]) }
    );
    expect(on).toMatchObject({ prov: "South Province", dist: "South Two", q: "08", loc: "Remote" });
    expect(applyPatch(on, { analyst: false }, loaded)).toMatchObject({
      prov: "South Province",
      dist: "South Two",
      q: "08",
      loc: null,
    });
  });

  it("clears the name search when it is emptied (7)", () => {
    const typed = applyPatch(DEFAULT_STATE, { q: "s" }, loaded);
    expect(applyPatch(typed, { q: "" }, loaded).q).toBeNull();
    expect(searchWithState("", applyPatch(typed, { q: "" }, loaded))).toBe("");
  });
});
