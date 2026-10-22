/** The glossary: a short heading over each run of terms, in reading order. */
import type { TermKey } from "./terms";

// Short headings for a glossary, each listing its term keys in reading order.
export const GLOSSARY_GROUPS = Object.freeze(
  (
    [
      { heading: "What the screen is", keys: ["screening", "inspection", "source", "rule", "rule_roles"] },
      {
        heading: "School need",
        keys: [
          "school_need",
          "need_classrooms",
          "need_housing",
          "need_facilities",
          "need_services",
          "need_locality",
        ],
      },
      {
        heading: "District context",
        keys: [
          "area_context",
          "area_grade10",
          "area_grade12",
          "area_secondary",
          "area_activity",
          "area_conflict",
          "area_girls",
        ],
      },
      { heading: "Other inputs", keys: ["urgency", "reach", "air_quality", "emissions", "land_cover"] },
      { heading: "Scores and ranks", keys: ["score", "rank", "rank_range", "tie_rule", "list_order"] },
      { heading: "Groups of schools", keys: ["cohort_complete", "cohort_ranked", "queue", "not_placed"] },
      { heading: "Map marks", keys: ["mark_dot", "mark_range", "mark_ring"] },
      {
        heading: "Missing details",
        keys: [
          "missing_classrooms",
          "missing_housing",
          "missing_facilities",
          "missing_services",
          "missing_all_but_remoteness",
          "unknown_value",
          "unusable_value",
          "not_calculable",
        ],
      },
      {
        heading: "Using the screen",
        keys: [
          "shortlist",
          "shortlist_size",
          "filters",
          "layers",
          "briefing_stops",
          "compare",
          "export",
          "manifest",
          "persistent_flag",
        ],
      },
    ] as { heading: string; keys: TermKey[] }[]
  ).map((g) => Object.freeze({ ...g, keys: Object.freeze(g.keys) }))
);
