/** The fixed lists of inputs that the sentences read: the six facility types and the six district figures. */
import type { AreaField, FacilityField } from "./model";

export const FACILITIES: readonly (readonly [FacilityField, string])[] = [
  ["libraries", "library"],
  ["workshops", "workshop"],
  ["practical_skills", "practical-skills room"],
  ["home_economics", "home-economics room"],
  ["computer_labs", "computer laboratory"],
  ["specialized_classrooms", "special classroom"],
];

export const AREA_PARTS: readonly (readonly [AreaField, number])[] = [
  ["progression10_deficit", 0.25],
  ["progression12_deficit", 0.15],
  ["secondary_participation_deficit", 0.25],
  ["activity_deficit", 0.15],
  ["conflict_exposure", 0.1],
  ["female_disadvantage", 0.1],
];
