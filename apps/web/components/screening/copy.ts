/**
 * Interim wording for the workspace, in one module so the plain-language copy system can replace it in one step.
 * It is deliberately short and says only what a control does. The rule labels come from the API for the same reason.
 */
export const COPY = {
  title: "School screening",
  ruleEyebrow: "Rule",
  otherRules: "Other rules",
  tabOrdered: "Ordered list",
  tabIncomplete: "Incomplete records",
  listIntro:
    "Schools in the order the rule gives. A school with a range sits between its best and worst place.",
  incompleteIntro: "These schools have no place in the list because their records are incomplete.",
  loading: "Loading the list",
  mapLoading: "Loading the map",
  retry: "Try again",
  loadFailed: "The list could not be loaded.",
  noRows: "No schools to show.",
  closeCard: "Close school card",
  cardEyebrow: "School",
  cardNoPlace: "No place in the list yet",
  mapLabel: "Map of schools",
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
