/**
 * Whether a school's urgency value is known comes from its stored inputs, not from which lists are loaded.
 *
 * Failure mode: a screen loads only lists of rules that leave urgency out, the record has no urgency entry, and
 * the note beside the urgency figure reads "Recorded in the source" for a school whose urgency is unknown.
 * Sample School 23 has no urgency value in the saved responses.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { schoolsFromLists } from "@/lib/screening/copy";

import { fixtureInputs, fixtureResults } from "./helpers";

const only = schoolsFromLists(fixtureInputs(), [fixtureResults("additive_no_u")], "additive_no_u");
const named = (name: string) => only.find((s) => s.name === name) as copy.CopySchool;

describe("with only a list that leaves urgency out", () => {
  it("knows a school with no urgency value has none", () => {
    const s23 = named("Sample School 23");
    expect(s23.components.U).toBeNull();
    expect(copy.missingValueKind(s23, "urgency")).toBe("blank");
    expect(copy.missingValueNote(s23, "urgency")).toBe(
      "Its urgency value is not recorded, and the rules that use urgency need it. The tool does not fill it in or count it as 0."
    );
  });

  it("knows a school with an urgency value has one", () => {
    const s08 = named("Sample School 08");
    expect(s08.components.U).not.toBeNull();
    expect(copy.missingValueKind(s08, "urgency")).toBe("recorded");
    expect(copy.missingValueNote(s08, "urgency")).toBe("Recorded in the source.");
  });
});
