/**
 * Whether a school's urgency rating is known comes from its stored inputs, not from which lists are loaded.
 *
 * Failure mode: a screen loads only lists of rules that leave urgency out, the record has no urgency entry, and
 * the note beside the urgency figure reads "Recorded in the source" for a school whose urgency is unknown.
 * Sample School 23 has no urgency rating in the saved responses.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { schoolsFromLists } from "@/lib/screening/copy";

import { fixtureInputs, fixtureResults } from "./helpers";

const only = schoolsFromLists(fixtureInputs(), [fixtureResults("additive_no_u")], "additive_no_u");
const named = (name: string) => only.find((s) => s.name === name) as copy.CopySchool;

describe("with only a list that leaves urgency out", () => {
  it("reads no scale into the stored value: it prints the engine's figure only when the engine's list is loaded", () => {
    const withList = schoolsFromLists(
      fixtureInputs(),
      [fixtureResults("additive_no_u"), fixtureResults("additive_u")],
      "additive_no_u"
    );
    const s08 = withList.find((s) => s.name === "Sample School 08") as copy.CopySchool;
    expect(copy.inputSentence(s08, "urgency")).toMatch(/^Its urgency rating is 0\.21 on a 0 to 1 scale/);
    expect(copy.inputSentence(named("Sample School 08"), "urgency")).not.toMatch(/0\.15|0\.21/);
  });

  it("knows a school with no urgency rating has none", () => {
    const s23 = named("Sample School 23");
    expect(s23.components.U).toBeNull();
    expect(copy.missingValueKind(s23, "urgency")).toBe("blank");
    expect(copy.missingValueNote(s23, "urgency")).toBe(
      "Its urgency rating is not recorded, and the rules that use urgency need it. The tool does not fill it in or count it as 0."
    );
  });

  it("knows a school with an urgency rating has one, and does not print the stored number as the engine's figure", () => {
    const s08 = named("Sample School 08");
    // The stored scalar is on its own scale; the engine's component (0.21 for this school) is not loaded.
    expect(s08.components).not.toHaveProperty("U");
    expect(copy.inputSentence(s08, "urgency")).toBe(
      "Its urgency rating is recorded. No one could trace where that value comes from."
    );
    expect(copy.missingValueKind(s08, "urgency")).toBe("recorded");
    expect(copy.missingValueNote(s08, "urgency")).toBe("Recorded in the source.");
  });
});
