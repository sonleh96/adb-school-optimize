/**
 * The homepage's words. Most readers are education officials who open the site once, then ADB staff, partners and
 * researchers, so the words are plain, the sentences short, and each idea is said in one place only. They pass the
 * same writing guards as the workspace's copy, its banned words included (tests/home/copy.test.ts), and the page
 * writes no word of its own.
 *
 * Each factual sentence rests on the research paper, the repository's own documents, or what the workspace's copy
 * already says; the claims table, `.audit-work/build/screening-20261020/w9/claims.md`, maps every one to its
 * source. The page never states a count as a literal: the numbers come from the API (`lib/home/counts.ts`) and every
 * sentence here reads true without them.
 */
// Relative imports, as the workspace's copy uses, so the browser tests can read the same words.
import { formatCount, plural } from "../screening/copy/format";
import { LAYOUT } from "../screening/copy/words";

import type { HomeCounts } from "./counts";

/** A heading in parts, where the accent part is set in the accent colour, as Darkhorse's headlines set theirs. */
export type Phrase = readonly (string | { readonly accent: string })[];

export const phraseText = (phrase: Phrase): string =>
  phrase.map((part) => (typeof part === "string" ? part : part.accent)).join("");

/**
 * Phrases a line never breaks inside: the product's name at its hyphen, the country's name, the bank's name, and a
 * grade and its number. As a pattern with one group, so `split` keeps each phrase as its own part.
 */
export const KEEP_TOGETHER = /(RISE-PNG|Papua New Guinea|Asian Development Bank|Grade \d+)/;

/**
 * The main method's weights, by factor, from its formula: school need 12 parts, district context 3 and the four
 * smaller factors 1 each, of 19. tests/home/copy.test.ts holds them to the workspace's own statement of each one.
 */
export const MAIN_SHARES = Object.freeze({
  N: 12 / 19,
  A: 3 / 19,
  R: 1 / 19,
  Q: 1 / 19,
  E: 1 / 19,
  L: 1 / 19,
});

const about = (share: number) => `about ${Math.round(share * 100)}%`;

/** What the whole site is, for the description every page carries and for an installed app. */
export const SITE = Object.freeze({
  description:
    "RISE-PNG suggests which secondary schools in Papua New Guinea to look at first, from the records already gathered, and shows the reasons for each.",
});

export const HOME = Object.freeze({
  meta: {
    title: LAYOUT.productSub,
    description: `${SITE.description} It is not a verdict on any school.`,
  },
  skip: "Skip to the main content",
  open: "Open the list",

  hero: {
    eyebrow: "Planning school inspections in Papua New Guinea",
    title: ["See which secondary schools to ", { accent: "look at first" }, ", and why."] as Phrase,
    lead: "Visits have to start somewhere, and school records are uneven. RISE-PNG uses the records already gathered to suggest an order to look in, and shows the reasons for each school.",
    who: "From a study by the project's research team for the Asian Development Bank (ADB).",
    how: "How it works",
    figuresTitle: "What the records cover",
    figuresNote:
      "A record needs verifying when a detail is missing or a figure needs checking, such as 0 classrooms.",
    // When the API cannot be read, the card keeps its three rows, each named as the tool names the group.
    noFigures: [
      { term: "All records", text: "The secondary school records the study gathered." },
      { term: "In the list", text: "Schools with enough detail to put in order now." },
      { term: LAYOUT.incompleteTab, text: "Schools whose records need verifying first." },
    ],
    queueLink: "See the schools not in the list yet",
  },

  scope: {
    eyebrow: "What the list can and cannot tell you",
    title: "It suggests where to look first. It is not a verdict on any school.",
    lead: "A school near the top is one whose records point to an early visit. A school lower down is not shown to be fine. Only an inspection visit can establish the real facts.",
    does: {
      title: "What the list does",
      items: [
        "It puts the schools with enough detail in their records in a suggested order to look in.",
        "It shows the main reasons for each school, from the school's own record.",
        "It shows which records need verifying, and what to verify.",
      ],
    },
    doesNot: {
      title: "What it does not do",
      items: [
        "It does not show a school's real condition or safety.",
        "It does not say whether repairs would help, or how to spend money.",
        "It has not yet been checked against what inspection visits find.",
      ],
    },
  },

  method: {
    eyebrow: "How the list is made",
    title: "School need counts most.",
    lead: "Each school gets a score from a few parts, and its rank is where that score puts it in the list. Each part has a fixed weight, which is how much it counts. The research team chose the weights and states them openly. They are policy choices, not estimates of what an inspection would gain.",
    weightsTitle: "How much each part counts",
    weights: [
      {
        key: "N",
        share: about(MAIN_SHARES.N),
        name: "School need",
        line: "Five parts of the school's own record: permanent classrooms, teacher housing, facility types, power and water, and remoteness.",
      },
      {
        key: "A",
        share: about(MAIN_SHARES.A),
        name: "District context",
        line: "Six figures for the school's district, such as the share of students moving on from Grade 7 to Grade 10.",
      },
      {
        key: "small",
        share: `${about(MAIN_SHARES.R)} each`,
        name: "Four smaller parts",
        line: "How many people live within walking distance, air quality, nearby emissions and land cover.",
      },
    ],
    notesTitle: "Three things to know",
    notes: [
      {
        title: "A missing figure shows as a range of ranks.",
        body: "A school without an air-quality figure shows the highest and lowest rank it could take, because the tool does not guess the missing figure.",
      },
      {
        title: "The main list leaves out the urgency rating.",
        body: `The rating came with the original school data, but how it was made has not been traced. Under "${LAYOUT.orderControl}", the tool can compare the list with the earlier method, which counts it.`,
      },
      {
        title: "The weights were tested.",
        body: "The research team changed the weights at random, thousands of times. Some schools stayed in the top 20 in at least 4 of every 5 runs, so whether they make the top 20 does not hang on one exact set of weights. Others moved in and out.",
      },
    ],
  },

  use: {
    eyebrow: "How to use it",
    title: "Start with your province.",
    steps: [
      "Choose Province in the list to see one province or district, or to find a school by name.",
      "Send the page's address to share the list you see, or download or print it for a meeting.",
      "Choose Help, then Guides, for a short tour of each part of the screen.",
    ],
    example: {
      caption:
        "One row of the list: a school's rank, its name and province, and the main reason. This school is made up.",
      rank: "1st",
      name: "Example Secondary School",
      where: "Example Province",
      why: "2 of its 8 classrooms are built of permanent materials.",
    },
  },

  research: {
    eyebrow: "About the study",
    title: "A decision-support case study, not yet final.",
    sentences: [
      "The paper calls itself a documented decision-support case study in choosing schools to inspect when the evidence is incomplete.",
      "The paper gives no single collection date for the school records. It keeps each source's own date, such as 2025 for the emissions and land-cover maps.",
      "The study does not claim that the records cover every school in the country.",
    ],
    status: {
      title: "Where the paper stands",
      sentences: [
        "The research team is still reviewing the paper, and has yet to decide whether to change the main method.",
        "No one outside the project has reproduced its results yet.",
      ],
    },
  },

  // The people to write to, as the user gave them on 4 November 2026. The only people the page names.
  contact: {
    title: "Questions, or a record that looks wrong?",
    people: [
      { name: "Son Le", email: "shle.consultant@adb.org" },
      { name: "Yohan Iddawela", email: "yiddawela@adb.org" },
    ],
  },

  footer: {
    navLabel: "More on this site",
    contactTitle: "Contact",
    links: {
      open: "Open the list",
      queue: "Schools not in the list yet",
      guides: "Open the guides",
    },
  },
});

/** One figure in the hero's card: the number as shown, and what it counts, worded to read after the number. */
export interface Figure {
  readonly key: "records" | "inOrder" | "toVerify";
  readonly value: string;
  readonly label: string;
}

/** The three figures, or none when the counts are not known. */
export function figuresFor(counts: HomeCounts): readonly Figure[] | null {
  if (counts.kind === "unknown") return null;
  const { records, inOrder, toVerify } = counts;
  return [
    {
      key: "records",
      value: formatCount(records),
      label: `secondary school ${plural(records, "record", "records")}`,
    },
    { key: "inOrder", value: formatCount(inOrder), label: "can be put in order now" },
    {
      key: "toVerify",
      value: formatCount(toVerify),
      label: plural(
        toVerify,
        "not in the list yet, because its record needs verifying first",
        "not in the list yet, because their records need verifying first"
      ),
    },
  ];
}
