/** Guide copy for task-first guidance: titles, "On screen" and "Try it" lines, and the rail's own words. */
import { SMALL, capitalise, ordinal, plural } from "./format";
import { countWord } from "./counts";
import { IDEAS } from "./ideas";
import { ruleCountWord } from "./rules";
import { type Segments, nameList, nameSegment, seg, textOf } from "./segments";
import { KEYS, LAYOUT } from "./words";

/* ------------------------------------------------- step lines that name a school */
// Each is built once from segments. The string form passes a name as plain text and the marked form passes it as a
// name, so the two read the same and the marked form knows where each name sits.
const whyTitle = (who: Segments, place: string | null): Segments =>
  place ? seg`What puts ${who} ${place}` : seg`${who} is not in the list yet`;
const rangeTitle = (who: Segments, place: string | null): Segments =>
  place ? seg`${who} could be ${place}` : seg`${who} has no rank under this method`;
const rangeTryIt = (names: Segments, n: number): Segments =>
  n === 1
    ? seg`It is ${names}. Select it.`
    : Number.isInteger(n) && n > 0
      ? seg`The ${countWord(n)} are ${names}. Select any of them.`
      : seg`They are ${names}. Select any of them.`;
const orderBody = (who: Segments, a: Segments, aPlace: string, b: Segments, bPlace: string): Segments =>
  seg`So ${who} sits between ${a}, ${aPlace}, and ${b}, ${bPlace}.`;
const mapBody = (who: Segments): Segments =>
  seg`The map draws it without the blue used for ranks in the list, so ${who} never looks like it has one rank.`;
const schoolTitle = (who: Segments): Segments => seg`What ${who} is missing`;
const rangesBody = (who: Segments): Segments => seg`The example under it follows ${who} under both methods.`;

/** The same lines with each school's name marked, for a screen that sets names apart. `names` are plain names. */
export const GUIDE_SEGMENTS = Object.freeze({
  whyTitle: (name: string, place: string | null) => whyTitle([nameSegment(name)], place),
  rangeTitle: (name: string, place: string | null) => rangeTitle([nameSegment(name)], place),
  rangeTryIt: (names: readonly string[], n: number) => rangeTryIt(nameList(names), n),
  orderBody: (name: string, a: string, aPlace: string, b: string, bPlace: string) =>
    orderBody([nameSegment(name)], [nameSegment(a)], aPlace, [nameSegment(b)], bPlace),
  mapBody: (name: string) => mapBody([nameSegment(name)]),
  schoolTitle: (name: string) => schoolTitle([nameSegment(name)]),
  rangesBody: (name: string) => rangesBody([nameSegment(name)]),
});

/* ------------------------------------------------------------------ guides */
// Shared guide copy for task-first guidance. Bodies come from the functions above;
// these are the titles, the "On screen" and "Try it" lines, and the rail's own words.
// A function title takes plain strings the variant already has, such as a display name.

export const GUIDE = Object.freeze({
  startEyebrow: "Start here",
  returningEyebrow: "Guides",
  startTitle: "What do you want to find out?",
  howTitle: LAYOUT.howTitle,
  explore: "Explore on my own",
  close: "Close guides",
  firstNote: "To see the guides again, choose Help, then Guides.",
  returningNote: "To see the guides again, choose Help, then Guides.",
  // Under "What do you want to find out?": what the tool is for, without the caveat the screen shows once at the map's foot.
  startLede: "This tool suggests which schools to look at first, with the main reason for each.",
  hide: "Hide the guides",
  hideAria: "Hide the guides",
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
  // Round 6: rail chrome.
  railAria: "Guide",
  sectionsAria: "Sections",
  seen: "Seen",
  stepCount: (n: number) => `${n}-step guide`,
  howCount: (n: number) => `${n} short ${plural(n, "section", "sections")} on how the list is made`,
  seenCount: (n: number, m: number) => `${n} of ${m} seen`,
  drift: "The screen has moved on from this step.",
  driftRestore: "Show this step again",
  // "anywhere from 5th to 6th", or "5th" when the ends meet; fills the place slot of a step title.
  rangeWords: (best: number, worst: number) =>
    best === worst ? ordinal(best) : `anywhere from ${ordinal(best)} to ${ordinal(worst)}`,
  viewFallbackOnScreen: "The list, the map and the school card",
  seedViews: Object.freeze({
    top: Object.freeze({
      name: "Top of the list under the main method",
      onScreen: "The list and the map",
    }),
    urgency: Object.freeze({ name: "With and without the urgency rating" }),
    range: Object.freeze({ name: "A school with a range of ranks" }),
    queue: Object.freeze({
      name: "Schools with missing information",
      onScreen: (incompleteTab: string) => `The "${incompleteTab}" tab, grouped by what is missing`,
    }),
  }),
  // Show only in presentation mode; see KEYS.
  pageHint: KEYS.pageHint,
  // The card is named for what it is, not for where it sits: in the narrow layout it replaces the list below the map.
  pointToCard: (n: number) =>
    n === 1
      ? "The school card lists the one thing that adds most to its score, in the school's own record."
      : n > 0
        ? `The school card lists the ${SMALL[n] || n} things that add most to its score, in the school's own record.`
        : "The school card shows what adds to its score.",
  pointToMissing:
    "The school card names each missing detail, and whether it is blank or recorded as 0 and needing a check.",
  // The card numbers the reasons inside school need.
  needNumbered: (n: number, all: number) =>
    all === 1
      ? "The one reason is a part of school need, so the card numbers it inside school need, above the parts that add less."
      : n === 1
        ? `One of the ${SMALL[all]} reasons is a part of school need, so the card numbers it inside school need, above the parts that add less.`
        : `${n === all ? `All ${SMALL[n]}` : `${capitalise(SMALL[n])} of the ${SMALL[all]}`} reasons are parts of school need, so the card numbers them inside it, above the parts that add less.`,
  tasks: Object.freeze(
    [
      {
        id: "q1",
        title: "Which schools to look at first",
        sub: IDEAS.notVerdict.title,
        steps: [
          { key: "first", title: "Where to look first", onScreen: "The first rows of the list" },
          {
            key: "rule",
            title: "The list says how it is ordered",
            onScreen: "The line above the list that says how it is ordered",
          },
          {
            key: "map",
            title: "The map shows the same order",
            onScreen: "The first school on the map, and the key",
            body: "Numbered dots are the first 10. The darker the blue, the earlier the school comes in the list.",
            tryIt: "Move the pointer over any dot to read its rank in the list.",
          },
          {
            key: "download",
            title: "Take the top list with you",
            onScreen: "The button that downloads the top list",
            tryIt: "Open Download the top list to see the first 20 schools and the method record.",
          },
        ],
      },
      {
        id: "q2",
        title: "Why a school sits where it does",
        sub: "The main reasons, from what is known about the school",
        steps: [
          {
            key: "why",
            title: (name: string, place: string | null) => textOf(whyTitle([name], place)),
            onScreen: "The school card",
            tryIt: "Select any other school in the list or on the map. This step follows your choice.",
          },
          {
            key: "need",
            title: (needReasons: boolean) =>
              needReasons ? "The reasons sit inside school need" : "Every item has its own row",
            onScreen: 'School need, inside "Why it sits here"',
          },
          {
            key: "adds",
            title: "What each item adds",
            onScreen: '"In numbers", lower in the school card',
            tryIt: `Turn on "For researchers: show method details" to see each item's share and its rank in the list under all ${ruleCountWord()} methods.`,
          },
        ],
      },
      {
        id: "q3",
        title: "Why some schools show a range of ranks",
        sub: IDEAS.ranges.title,
        steps: [
          {
            key: "range",
            title: (name: string, place: string | null) => textOf(rangeTitle([name], place)),
            onScreen: "The school card",
            body: "The school card gives its highest and lowest ranks in the list, and whether it is in the top 20 either way.",
            tryIt: (names: string, n: number) => textOf(rangeTryIt([names], n)),
          },
          {
            key: "order",
            title: "Where it sits in the list",
            onScreen: "Its row in the list, and the note above the list",
            body: (name: string, a: string, aPlace: string, b: string, bPlace: string) =>
              textOf(orderBody([name], [a], aPlace, [b], bPlace)),
          },
          {
            key: "map",
            title: "On the map, a ring with a centre dot",
            onScreen: "The school on the map, and the key",
            body: (name: string) => textOf(mapBody([name])),
          },
        ],
      },
      {
        id: "q4",
        title: "Which schools are not in the list yet",
        sub: IDEAS.queue.title,
        steps: [
          {
            key: "list",
            title: (count: number) =>
              count === 1
                ? "One school is not in the list yet"
                : count === 0
                  ? "Every school is in the list"
                  : `${count} schools are not in the list yet`,
            onScreen: "The Missing information tab and its list",
          },
          {
            key: "group",
            title: "Group them by what is missing",
            onScreen: '"Group by" above the list, and the first group',
            tryIt: "Choose a kind of missing detail to show only those schools.",
          },
          {
            key: "school",
            title: (name: string) => textOf(schoolTitle([name])),
            onScreen: "The school card",
            tryIt: "Select any other school in the list. This step follows your choice.",
          },
        ],
      },
      {
        id: "q5",
        title: "What changes without the urgency rating",
        sub: "What changes if the urgency rating is added back?",
        steps: [
          {
            key: "agree",
            title: (k: number | null) =>
              k
                ? `The same ${k} schools make the top ${k} with or without the urgency rating`
                : "With or without the urgency rating",
            onScreen: '"What changed", at the top of the list',
            body: "\"What changed\", at the top of the list, compares the earlier paper's method, which includes the urgency rating, with the main method, which leaves it out, using the research team's recorded comparison.",
          },
          {
            key: "why",
            title: "Why the urgency rating is left out",
            onScreen: "The line above the list that says how it is ordered",
          },
          {
            key: "ranges",
            title: "Schools with a range of ranks move more",
            onScreen: 'The example in "What changed"',
            body: (name: string) => textOf(rangesBody([name])),
          },
          {
            key: "use",
            title: "Switch between the two methods yourself",
            onScreen: "The line above the list that says how it is ordered",
            tryIt: (label: string) =>
              `Choose "${label}" to put the urgency rating back and see the earlier paper's method. "See the full comparison" opens the method details.`,
          },
        ],
      },
    ].map((t) => Object.freeze({ ...t, steps: Object.freeze(t.steps.map((st) => Object.freeze(st))) }))
  ),
});
