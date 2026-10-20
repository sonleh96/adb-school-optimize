/**
 * Reproduces a defect found on the study's data: a help card's example, about another school, said word for word
 * what the open school card already said, because both schools lack the same facilities.
 * Failure mode: a help card repeats a sentence the screen already shows (notes/final.md, "Critique pass 1").
 */
import { describe, expect, it } from "vitest";

import { copyFor, textOf } from "@/lib/screening/copy";
import { cardModel } from "@/lib/screening/guide/cards";
import { rolesOf } from "@/lib/screening/guide/roles";

import { school } from "./copy/helpers";

const none = {
  libraries: 0,
  workshops: 0,
  practical_skills: 0,
  home_economics: 0,
  computer_labs: 0,
  specialized_classrooms: 0,
};
const open = school({ id: "c3", place: 3, condition: none });
const twin = school({ id: "c1", place: 1, condition: none });
const other = school({ id: "c2", place: 2 });
const schools = [twin, other, open];
const copy = copyFor({ schools });
const roles = rolesOf(schools, copy)!;

describe("a help card's example", () => {
  it("skips a school whose sentence is the open card's, and names one whose sentence differs", () => {
    const card = cardModel(
      { copy, roles, rule: "additive_u", schools, open: "c3", groups: [] },
      "term:need_facilities"
    )!;
    expect(card.examples.map((e) => e.school)).toEqual(["c2"]);
    expect(textOf(card.examples[0].text)).not.toBe(copy.inputSentence(open, "facilities"));
  });

  it("uses the first school of the role when no school is open", () => {
    const card = cardModel(
      { copy, roles, rule: "additive_u", schools, open: null, groups: [] },
      "term:need_facilities"
    )!;
    expect(card.examples.map((e) => e.school)).toEqual(["c1"]);
  });
});
