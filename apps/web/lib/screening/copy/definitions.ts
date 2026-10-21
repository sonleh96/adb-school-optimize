/** Definitions that several sentences share, kept in one place so they cannot drift apart. */

export const GROUPS_MEANING =
  "Being put in order is not a selection or an approval; it only means the record has enough detail to compare.";
export const SEPARATE_MEASURES =
  "Air quality, nearby emissions and land cover are three separate measures, and the screen never adds them together.";
export const SCHOOL_NEED_DEFINITION =
  "School need is a 0 to 1 measure built from five parts of the school's own record: permanent classrooms, teacher housing, facility types, power and water, and remoteness.";
export const AIR_DEFINITION =
  "The air-quality reading is an air-pollution index assigned to the school's location.";
export const SIX_FACILITIES =
  "library, workshop, practical-skills room, home-economics room, computer laboratory and special classroom";
// Wording kept in one place: no source in the project confirms this is an official national scale.
export const REMOTENESS_SCALE = "a six-step remoteness scale from highly accessible to extremely remote";
export const SOURCE_LINE =
  'Source: the research paper "Comparing approaches to screening existing school locations in Papua New Guinea", circulated on 12 October 2026.';
/** The six categories the study's remoteness scale holds, as the engine reads them (lower case). */
export const REMOTENESS_CATEGORIES: readonly string[] = [
  "highly accessible",
  "accessible",
  "moderately accessible",
  "remote",
  "very remote",
  "extremely remote",
];
