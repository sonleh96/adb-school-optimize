/** Guide copy for task-first guidance: titles, "On screen" and "Try it" lines, and the rail's own words. */
import { SMALL, capitalise } from "./format";
import { countWord } from "./counts";
import { IDEAS } from "./ideas";
import { ruleCountWord } from "./rules";
import { KEYS } from "./words";

/* ------------------------------------------------------------------ guides */
// Shared guide copy for task-first guidance. Bodies come from the functions above;
// these are the titles, the "On screen" and "Try it" lines, and the rail's own words.
// A function title takes plain strings the variant already has, such as a display name.

export const GUIDE = Object.freeze({
  startEyebrow: "Start here",
  returningEyebrow: "Guides",
  startTitle: "What do you want to find out?",
  howTitle: "How this works",
  explore: "Explore on my own",
  close: "Close guides",
  firstNote: "Guides stay one click away, at the top of the map.",
  returningNote: "Each guide puts the screen in the right state, then hands it back.",
  onScreen: "On screen",
  tryIt: "Try it",
  upNext: "Up next",
  back: "Back",
  next: "Next",
  nextGuide: "Next guide",
  finish: "Finish",
  skip: "Skip this guide",
  finishClose: "Finish and close",
  allGuides: "All guides",
  stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  // One counter for the rail: "Guide 2 of 5, step 1 of 3".
  stepCounter: (g: number, guides: number, i: number, n: number) =>
    `Guide ${g} of ${guides}, step ${i} of ${n}`,
  // Show only in presentation mode; see KEYS.
  pageHint: KEYS.pageHint,
  pointToCard: (n: number) =>
    n > 0
      ? `The card on the right lists the ${SMALL[n] || n} things that add most to its screening score, in the school's own record.`
      : "The card on the right shows what adds to its screening score.",
  pointToMissing:
    "The card on the right names each missing detail, and whether it is blank or recorded as 0 and needing a check.",
  // The card numbers the reasons inside school need. needDots keeps its name for older callers.
  needNumbered: (n: number, all: number) =>
    `${n === all ? `All ${SMALL[n]}` : `${capitalise(SMALL[n])} of the ${SMALL[all]}`} reasons are parts of school need, so the card numbers them inside it, above the parts that add less.`,
  needDots: (n: number, all: number) =>
    `${n === all ? `All ${SMALL[n]}` : `${capitalise(SMALL[n])} of the ${SMALL[all]}`} reasons are parts of school need, so the card numbers them inside it, above the parts that add less.`,
  tasks: Object.freeze(
    [
      {
        id: "q1",
        title: "Which schools to inspect first",
        sub: IDEAS.notVerdict.title,
        steps: [
          { key: "first", title: "Where to look first", onScreen: "The first rows of the list" },
          { key: "rule", title: "The rule is named at the top", onScreen: "The rule, above the list" },
          {
            key: "map",
            title: "The map shows the same order",
            onScreen: "The first school on the map, and the legend",
            body: "Numbered dots are the first 10. The darker the blue, the earlier the school comes in the list.",
            tryIt: "Move the pointer over any dot to read its place in the list.",
          },
          {
            key: "download",
            title: "Take the top list with you",
            onScreen: "Download the top list, top right",
            tryIt: "Open Download the top list to see the first 20 schools and the method record.",
          },
        ],
      },
      {
        id: "q2",
        title: "Why a school sits where it does",
        sub: "The things that add most, in the school's own record",
        steps: [
          {
            key: "why",
            title: (name: string, place: string | null) =>
              place ? `What puts ${name} ${place}` : `${name} has no place in the list yet`,
            onScreen: "The school card, on the right",
            tryIt: "Select any other school in the list or on the map. This step follows your choice.",
          },
          {
            key: "need",
            title: (needReasons: boolean) =>
              needReasons ? "The reasons sit inside school need" : "Every input has its own row",
            onScreen: 'School need, inside "Why it sits here"',
          },
          {
            key: "adds",
            title: "What each input adds",
            onScreen: '"In numbers", lower in the school card',
            tryIt: `Turn on "Show method details" to see each input's share and its place in the list under all ${ruleCountWord()} rules.`,
          },
        ],
      },
      {
        id: "q3",
        title: "Why some schools show a range",
        sub: IDEAS.ranges.title,
        steps: [
          {
            key: "range",
            title: (name: string, place: string | null) =>
              place ? `${name} could be ${place}` : `${name} has no place under this rule`,
            onScreen: "The school card, on the right",
            body: "The card on the right gives its highest and lowest places in the list, and whether it is in the top 20 either way.",
            tryIt: (names: string, n: number) =>
              Number.isInteger(n) && n > 0
                ? `The ${countWord(n)} are ${names}. Select any of them.`
                : `They are ${names}. Select any of them.`,
          },
          {
            key: "order",
            title: "Where it sits in the list",
            onScreen: "Its row in the list, and the note above the list",
            body: (name: string, a: string, aPlace: string, b: string, bPlace: string) =>
              `So ${name} sits between ${a}, ${aPlace}, and ${b}, ${bPlace}.`,
          },
          {
            key: "map",
            title: "On the map, a ring with a centre dot",
            onScreen: "The school on the map, and the legend",
            body: (name: string) =>
              `The map draws it without the blue used for places in the list, so ${name} never looks like it has one place.`,
          },
        ],
      },
      {
        id: "q4",
        title: "Which schools cannot be put in order yet",
        sub: IDEAS.queue.title,
        steps: [
          {
            key: "list",
            title: (count: number) => `${count} schools cannot be put in order yet`,
            onScreen: "The Incomplete records tab and its list",
          },
          {
            key: "group",
            title: "Group them by what is missing",
            onScreen: '"Group by" above the list, and the first group',
            tryIt: "Choose a kind of missing detail to show only those schools.",
          },
          {
            key: "school",
            title: (name: string) => `What ${name} is missing`,
            onScreen: "The school card, on the right",
            tryIt: "Select any other school in the list. This step follows your choice.",
          },
        ],
      },
      {
        id: "q5",
        title: "What changes without the urgency value",
        sub: "What changes if the uncertain urgency value is left out?",
        steps: [
          {
            key: "agree",
            title: (k: number | null) =>
              k
                ? `The same ${k} schools make the top ${k} with or without urgency`
                : "With or without urgency",
            onScreen: '"What changed", at the top of the list',
            body: '"What changed", at the top of the list, compares the two rules using the study\'s recorded comparison.',
          },
          {
            key: "why",
            title: "Why the urgency value is in question",
            onScreen: "The two main rules, above the list",
          },
          {
            key: "ranges",
            title: "Schools with possible places move more",
            onScreen: 'The example in "What changed"',
            body: (name: string) => `The example under it follows ${name} under both rules.`,
          },
          {
            key: "use",
            title: "Use the proposed revision yourself",
            onScreen: "The two main rules, above the list",
            tryIt: (label: string) =>
              `Choose "${label}" to go back to the paper's main rule. "See the full comparison" opens the method details.`,
          },
        ],
      },
    ].map((t) => Object.freeze({ ...t, steps: Object.freeze(t.steps.map((st) => Object.freeze(st))) }))
  ),
});
