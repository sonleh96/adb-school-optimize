import type { Failure } from "@/lib/screening/errors";

/**
 * Interim wording for the workspace, in one module so the plain-language copy system can replace it in one step.
 * It is deliberately short and says only what a control does. The rule labels and the scope of each place come
 * from the API in its own words, and the functions below only put them in a sentence.
 */
export const COPY = {
  title: "School screening",
  ruleEyebrow: "Rule",
  otherRules: "Other rules",
  tabOrdered: "Ordered list",
  tabIncomplete: "Incomplete records",
  listIntro:
    "Schools in the order the rule gives. A school with a range sits between its best and worst place.",
  /** The list header's statement of what a place is counted among. */
  listScopes: (placeScope: string, rangeScope: string) =>
    `Places count schools that are ${placeScope}. A range counts schools that are ${rangeScope}.`,
  incompleteIntro: "These schools have no place in the list because their records are incomplete.",
  provinceUnknown: "Province not recorded",
  loading: "Loading the list",
  mapLoading: "Loading the map",
  noRows: "No schools to show.",
  /** A place and what it is counted among, as in the tooltip. */
  placeAmong: (place: string, scope: string) => `${place} among schools that are ${scope}`,
  rangeTo: "to",
  /** Shown with a range whose two ends are the same place. */
  exactRange: "Exact place, even with a missing input",
  cardEyebrow: "School",
  cardNoPlace: "No place in the list yet",
  cardRule: (ruleLabel: string) => `Under ${ruleLabel}`,
  /** What the card's place is counted among. */
  cardScope: (scope: string) => `Counted among schools that are ${scope}`,
  closeCard: "Close school card",
  /** The map's accessible name. The list is the keyboard route to every school. */
  mapLabel:
    "Map of schools. To choose a school with the keyboard, use the ordered list or the incomplete records.",
  /** The basemap's credit, as its licence requires it. */
  attribution: { osm: "© OpenStreetMap contributors", carto: "© CARTO" },
  legendLabel: "Legend",
  guideLabel: "Guide",
  basemapUnavailable: "The basemap could not be loaded. The marks and the list still work.",
  refreshFailed: "The list could not be refreshed. This is the last one that loaded.",
  retry: "Try again",
  signIn: "Sign in again",
  failure: {
    session: "Your session has ended.",
    not_found: "This list is not available. The rule or the data may have been withdrawn.",
    server: "The service had a problem. Try again in a moment.",
    malformed: "The service sent something this page does not understand.",
    network: "The service could not be reached. Check the connection and try again.",
    other: "The list could not be loaded.",
  } satisfies Record<Failure, string>,
  legend: {
    place: "Place in the list",
    range: "Range of possible places",
    incomplete: "Incomplete record",
    steps: ["1st to 10th", "11th to 20th", "21st to 40th", "41st to 80th", "81st on"],
  },
  slots: {
    // Each marks a part of the design that a later change fills in.
    rowWhy: "Why line",
    card: "The full school card arrives with the school card change.",
  },
} as const;
