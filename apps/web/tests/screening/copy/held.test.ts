/**
 * Why the engine holds a school back, read from the API's own `gate_failures` and worded for each reason.
 * The records here are the saved API response for an invented school with its fields changed, so each case is a
 * response the API could send.
 *
 * Failure modes, each with the test that catches it:
 *  1. The adapter rebuilds the reasons from the blank need parts, so a school held for another reason gets none and
 *     reads "its school need cannot be worked out" while school need is known.
 *  2. A reason is worded as a blank when the value is recorded but cannot be used, or the reverse.
 *  3. A district figure or a count is named that the record does not show as the cause.
 *  4. A reason this copy has no words for yet makes the sentence empty or wrong instead of saying only that the
 *     record needs checking.
 */
import { describe, expect, it } from "vitest";

import * as copy from "@/lib/screening/copy";
import { ParseError, parseWith } from "@/lib/screening/schema";
import { schoolFromDetail } from "@/lib/screening/copy";

import { copy as clone, readFixture } from "../fixtures";
import { KEYS, textProblems } from "./helpers";
import { schoolDetailResponse } from "@/lib/screening/types";

type Entry = {
  rule: { rule_id: string };
  result: {
    cohort: string;
    gate_failures: string[];
    components: Record<string, number | null>;
    need_parts: Record<string, number | null>;
    area_parts: Record<string, number | null>;
  };
};
type Body = {
  school: { locality: string | null };
  inputs: Record<string, number | string | null>;
  rules: Entry[];
};

const READS_URGENCY = ["additive_u", "need_first_u", "bottleneck_u", "benchmark"];

/** Sample School 08, which can be put in order under every rule, with a change that holds it back. */
function held(change: (b: Body) => void, only?: readonly string[], view: copy.CopyRuleId = "additive_u") {
  const b = clone(readFixture(`schools/${KEYS.complete}.json`)) as Body;
  change(b);
  for (const e of b.rules) if (!only || only.includes(e.rule.rule_id)) e.result.cohort = "verification_queue";
  return schoolFromDetail(parseWith(schoolDetailResponse, b, "school"), view);
}
const everyRule = (b: Body, f: (e: Entry) => void) => b.rules.forEach(f);

describe("a school held back only because its urgency value is unknown", () => {
  const s = held(
    (b) =>
      b.rules.forEach((e) => {
        if (READS_URGENCY.includes(e.rule.rule_id)) {
          e.result.gate_failures = ["urgency_unknown"];
          e.result.components.U = null;
        }
      }),
    READS_URGENCY
  );

  it("is held for that reason and for no other", () => {
    expect(s.cohort).toBe("queue");
    expect(s.gate_failures).toEqual(["urgency_unknown"]);
    expect(s.components.N).toBe(0.7933333333333333);
  });

  it("does not say school need cannot be worked out, because it can", () => {
    expect(copy.missingValueKind(s, "need")).toBe("recorded");
    expect(copy.missingSentence(s, "additive_u")).not.toMatch(/school need cannot be worked out/i);
    expect(copy.missingValueNote(s, "need")).toBe("Recorded in the source.");
  });

  it("names the cause in a chip, in the sentences and in the note", () => {
    expect(copy.missingLabels(s)).toEqual(["Urgency value not recorded"]);
    expect(copy.missingSentences(s, "additive_u")).toEqual([
      "Its urgency value is not recorded, and the rules that use urgency need it.",
      "The rules that leave urgency out do not need it, so they can put this school in order.",
      "Until the urgency value is recorded, it has no place in the list under a rule that uses urgency.",
      "Having no place in the list yet does not mean its need is low.",
    ]);
    expect(copy.missingValueKind(s, "urgency")).toBe("blank");
    expect(copy.missingValueNote(s, "urgency")).toBe(
      "Its urgency value is not recorded, and the rules that use urgency need it. The tool does not fill it in or count it as 0."
    );
    expect(copy.inputSentence(s, "urgency")).toBe(
      "Its urgency value is not recorded, and the rules that use urgency need it."
    );
  });

  it("is true: the rules that leave urgency out still put the school in order", () => {
    const t = held(
      (b) =>
        b.rules.forEach((e) => {
          if (READS_URGENCY.includes(e.rule.rule_id)) {
            e.result.gate_failures = ["urgency_unknown"];
            e.result.components.U = null;
          }
        }),
      READS_URGENCY,
      "additive_no_u"
    );
    expect(t.cohort).toBe("complete");
    expect(t.gate_failures).toEqual([]);
  });
});

describe("a school held back for a remoteness category", () => {
  const withLocality = (locality: string | null) =>
    held((b) => {
      b.school.locality = locality;
      everyRule(b, (e) => {
        e.result.gate_failures = ["unrecognized_locality"];
        e.result.need_parts.locality_disadvantage = null;
        e.result.components.N = null;
      });
    });

  it("says a category that is not on the scale is recorded but cannot be used", () => {
    const s = withLocality("Nowhere");
    expect(s.gate_failures).toEqual(["locality_disadvantage"]);
    expect(copy.missingLabels(s)).toEqual(["Remoteness off the scale, needs checking"]);
    expect(copy.missingValueKind(s, "locality")).toBe("unusable");
    expect(copy.missingSentences(s, "additive_u")[0]).toBe(
      "The recorded remoteness category is not on the study's scale, which needs checking, and until then remoteness cannot be worked out."
    );
    expect(copy.inputSentence(s, "locality")).toBe(
      "Its remoteness category is recorded as Nowhere, which is not on the study's scale."
    );
    expect(copy.missingSentence(s, "additive_u")).not.toMatch(/blank/);
  });

  it("still says a blank category is blank", () => {
    for (const blank of [null, "  "]) {
      const s = withLocality(blank);
      expect(copy.missingLabels(s)).toEqual(["Remoteness blank"]);
      expect(copy.missingValueKind(s, "locality")).toBe("blank");
      expect(copy.missingSentences(s, "additive_u")[0]).toBe(
        "The remoteness category is blank in the record."
      );
    }
  });
});

describe("a school held back because a district figure or its reach cannot be worked out", () => {
  const s = held((b) =>
    everyRule(b, (e) => {
      e.result.gate_failures = ["unresolved_area_context", "unresolved_reach"];
      e.result.area_parts.secondary_participation_deficit = null;
      e.result.area_parts.activity_scale_deficit = null;
      e.result.components.A = null;
      e.result.components.R = null;
    })
  );

  it("names the district figures that are missing, and no others", () => {
    expect(s.gate_failures).toEqual(["unresolved_area_context", "unresolved_reach"]);
    expect(copy.missingSentences(s, "additive_u").slice(0, 2)).toEqual([
      "The secondary enrolment figure and the night-time light figure for its district are not recorded or cannot be used, so its district context cannot be worked out.",
      "The number of people within modelled walking distance is not recorded or cannot be used, so its walking reach cannot be worked out.",
    ]);
    expect(copy.missingLabels(s)).toEqual([
      "District figure missing or unusable",
      "Walking reach missing or unusable",
    ]);
  });

  it("closes without claiming school need is unknown, and reads the notes as figures that cannot be worked out", () => {
    expect(copy.missingSentences(s, "additive_u").slice(2)).toEqual([
      "Until these are checked, it has no place in the list yet.",
      "Having no place in the list yet does not mean its need is low.",
    ]);
    expect(copy.missingValueKind(s, "area")).toBe("not_calculable");
    expect(copy.missingValueNote(s, "reach")).toBe(
      "The number of people within modelled walking distance is not recorded or cannot be used, so its walking reach cannot be worked out. The tool does not fill it in or count it as 0."
    );
    expect(copy.inputSentence(s, "area")).toBe(copy.missingSentences(s, "additive_u")[0]);
  });

  it("names one district figure in the singular", () => {
    const one = held((b) =>
      everyRule(b, (e) => {
        e.result.gate_failures = ["unresolved_area_context"];
        e.result.area_parts.conflict_exposure = null;
        e.result.components.A = null;
      })
    );
    expect(copy.missingSentences(one, "additive_u")[0]).toBe(
      "The conflict exposure figure for its district is not recorded or cannot be used, so its district context cannot be worked out."
    );
    expect(copy.missingSentences(one, "additive_u")[1]).toBe(
      "Until this is checked, it has no place in the list yet."
    );
  });
});

/**
 * What the engine sends for a count that cannot be a denominator: a total of classrooms or a number of teachers
 * that is 0 or below holds back the share built on it (`nonpositive_denominator`), and a negative one also trips
 * `negative_stock_value`. The share is null, and so is school need.
 */
const stockProblem = (
  b: Body,
  part: "permanent_classroom_deficit" | "teacher_housing_deficit",
  codes: string[]
) =>
  everyRule(b, (e) => {
    e.result.gate_failures = codes;
    e.result.need_parts[part] = null;
    e.result.components.N = null;
  });

describe("a school held back for a negative count", () => {
  const s = held((b) => {
    b.inputs.teachers = -3;
    b.inputs.libraries = -1;
    stockProblem(b, "teacher_housing_deficit", ["negative_stock_value", "nonpositive_denominator"]);
  });

  it("names the counts that are negative and says they need checking, without calling any of them blank", () => {
    expect(copy.missingLabels(s)).toEqual([
      "Negative teacher count, needs checking",
      "Negative count, needs checking",
    ]);
    expect(copy.missingSentences(s, "additive_u").slice(0, 2)).toEqual([
      "The number of teachers is recorded as a negative number, which needs checking, and until then teacher housing cannot be worked out.",
      "The library count is recorded as a negative number, which needs checking.",
    ]);
    expect(copy.missingSentence(s, "additive_u")).not.toMatch(/blank/);
    expect(copy.missingValueKind(s, "housing")).toBe("unusable");
  });

  it("says a negative total of classrooms is negative, not that the permanent count is blank", () => {
    const one = held((b) => {
      b.inputs.total_classrooms = -2;
      stockProblem(b, "permanent_classroom_deficit", ["negative_stock_value", "nonpositive_denominator"]);
    });
    expect(copy.missingLabels(one)).toEqual(["Negative classroom count, needs checking"]);
    expect(copy.missingSentences(one, "additive_u")[0]).toBe(
      "The total number of classrooms is recorded as a negative number, which needs checking, and until then the share built of permanent materials cannot be worked out."
    );
    expect(copy.missingSentence(one, "additive_u")).not.toMatch(/blank/);
    expect(copy.missingValueNote(one, "classrooms")).not.toMatch(/blank/);
  });

  it("says a school that records no teachers has no teachers, and that a zero cannot be divided by", () => {
    const none = held((b) => {
      b.inputs.teachers = 0;
      stockProblem(b, "teacher_housing_deficit", ["nonpositive_denominator"]);
    });
    expect(copy.missingLabels(none)).toEqual(["Record gives 0 teachers, needs checking"]);
    expect(copy.missingSentence(none, "additive_u")).not.toMatch(/blank/);
  });

  it("still says a blank permanent count is blank when the total is recorded", () => {
    const blank = held((b) => {
      b.inputs.permanent_classrooms = null;
      stockProblem(b, "permanent_classroom_deficit", ["missing_stock_field"]);
    });
    expect(copy.missingLabels(blank)).toEqual(["Permanent classroom count blank"]);
  });

  it("keeps school need out of it when only a count that is not a denominator is negative", () => {
    const only = held((b) => {
      b.inputs.libraries = -1;
      everyRule(b, (e) => (e.result.gate_failures = ["negative_stock_value"]));
    });
    expect(copy.missingValueKind(only, "need")).toBe("recorded");
    expect(copy.missingSentence(only, "additive_u")).not.toMatch(/school need cannot be worked out/i);
    expect(copy.missingSentences(only, "additive_u")[0]).toBe(
      "The library count is recorded as a negative number, which needs checking."
    );
  });
});

describe("a school held back for several reasons", () => {
  const s = held((b) => {
    b.inputs.teachers = null;
    everyRule(b, (e) => {
      e.result.gate_failures = [
        "missing_stock_field",
        "unresolved_area_context",
        "unresolved_reach",
        "urgency_unknown",
      ];
      e.result.need_parts.teacher_housing_deficit = null;
      e.result.area_parts.conflict_exposure = null;
      e.result.components.N = null;
      e.result.components.A = null;
      e.result.components.R = null;
      e.result.components.U = null;
    });
  });

  it("lists the need parts first, then the other reasons in the engine's order", () => {
    expect(s.gate_failures).toEqual([
      "teacher_housing_deficit",
      "unresolved_area_context",
      "unresolved_reach",
      "urgency_unknown",
    ]);
    expect(copy.missingLabels(s)).toEqual([
      "Teacher count blank",
      "District figure missing or unusable",
      "Walking reach missing or unusable",
      "Urgency value not recorded",
    ]);
  });

  it("closes on school need only because a need part is among the reasons", () => {
    const sentences = copy.missingSentences(s, "additive_u");
    expect(sentences.at(-2)).toBe(
      "Until these are checked, its school need cannot be worked out, so it has no place in the list yet."
    );
    expect(copy.missingValueNote(s, "need")).toBe(
      "School need cannot be worked out, because the number of teachers is blank in the record."
    );
  });

  it("reads clean", () => {
    for (const t of copy.missingSentences(s, "additive_u")) expect(textProblems(t)).toEqual([]);
    for (const t of copy.missingLabels(s)) expect(textProblems(t, { sentence: false })).toEqual([]);
  });
});

describe("a reason this copy has no words for", () => {
  it("is left out of the list and the record still says it needs checking", () => {
    const s = held((b) => everyRule(b, (e) => (e.result.gate_failures = ["a_reason_added_later"])));
    expect(s.gate_failures).toEqual([]);
    expect(copy.missingLabels(s)).toEqual(["Record needs checking"]);
    expect(copy.missingSentences(s, "additive_u")).toEqual([
      "Its record needs checking before it can be put in order.",
      "Having no place in the list yet does not mean its need is low.",
    ]);
  });

  it("is refused by the sentences when it reaches them as a reason", () => {
    const s = { ...held(() => {}), gate_failures: ["a_reason_added_later" as never] };
    expect(() => copy.missingLabels(s)).toThrow("No gate called a_reason_added_later");
  });
});

describe("the response", () => {
  it("must carry the reasons", () => {
    const b = clone(readFixture(`schools/${KEYS.complete}.json`)) as {
      rules: { result: Record<string, unknown> }[];
    };
    delete b.rules[0].result.gate_failures;
    expect(() => parseWith(schoolDetailResponse, b, "Screening school")).toThrow(ParseError);
    expect(() => parseWith(schoolDetailResponse, b, "Screening school")).toThrow(
      "rules[0].result.gate_failures: expected an array, got undefined"
    );
  });
});
