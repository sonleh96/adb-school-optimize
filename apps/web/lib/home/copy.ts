/**
 * The homepage's words. Most readers are education officials who open the site once, then ADB staff, partners and
 * researchers, so the words are plain and the sentences short. They pass the same writing guards as the workspace's
 * copy, its banned words included (tests/home/copy.test.ts), and the page writes no word of its own.
 *
 * Each factual sentence rests on the research paper or on what the workspace's own copy already says; the claims
 * table, `.audit-work/build/screening-20261020/w9/claims.md`, maps every one to its source. The page never states
 * a count as a literal: the numbers come from the API (`lib/home/counts.ts`) and every sentence here reads true
 * without them.
 */
// Relative imports, as the workspace's copy uses, so the browser tests can read the same words.
import { formatCount, plural } from "../screening/copy/format";
import { STRINGS } from "../screening/copy/strings";
import { LAYOUT } from "../screening/copy/words";

import type { HomeCounts } from "./counts";

/** A heading in parts, where the accent part is set in the accent colour, as Darkhorse's headlines set theirs. */
export type Phrase = readonly (string | { readonly accent: string })[];

export const phraseText = (phrase: Phrase): string =>
  phrase.map((part) => (typeof part === "string" ? part : part.accent)).join("");

/**
 * Phrases a line never breaks inside: the product's name at its hyphen, the country's name, and a grade and its
 * number. As a pattern with one group, so `split` keeps each phrase as its own part.
 */
export const KEEP_TOGETHER = /(RISE-PNG|Papua New Guinea|Grade \d+)/;

/**
 * The main method's shares, by factor, from its formula: school need 12 parts, district context 3 and the four
 * smaller factors 1 each, of 19. tests/home/copy.test.ts holds them to the workspace's own statement of each share.
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

export const HOME = Object.freeze({
  meta: {
    title: LAYOUT.productSub,
    description:
      "RISE-PNG suggests which secondary schools in Papua New Guinea to look at first, from the records already gathered, and shows the reasons for each. It is not a verdict on any school.",
  },
  skip: "Skip to the main content",
  open: "Open the list",

  hero: {
    eyebrow: "School inspections in Papua New Guinea",
    title: ["See which secondary schools to ", { accent: "look at first" }, ", and why."] as Phrase,
    lead: "Visits have to start somewhere, and school records are uneven. RISE-PNG uses the records already gathered to suggest an order to look in, and shows the reasons for each school.",
    how: "How it works",
    figuresTitle: "What the records cover",
    figuresNote:
      "A record needs verifying when a detail is missing or a figure needs checking, such as 0 classrooms.",
    noFigures: [
      "The list covers the secondary schools whose records the study gathered.",
      "A school with enough detail in its record can be put in order now.",
      "The others need their records verified first.",
    ],
    queueLink: "See the schools not in the list yet",
  },

  problem: {
    eyebrow: "Why the list exists",
    title: "Where should inspections start?",
    lead: "An inspection plan has to begin with some schools and not others. The records that could guide that choice are uneven.",
    cards: [
      {
        eyebrow: "The question",
        title: "Which schools first?",
        body: "The list suggests which existing secondary schools to look at first. It works only from records already gathered.",
      },
      {
        eyebrow: "The records",
        title: "Records with gaps.",
        body: "Some school records miss a detail, such as a power source. Others hold a figure that needs checking, such as 0 classrooms. The tool never fills in a missing detail.",
      },
      {
        eyebrow: "The reasons",
        title: "Reasons anyone can check.",
        body: "Each school in the list comes with the main reasons for its rank, taken from its own record. A choice that shows its reasons can be questioned.",
      },
    ],
  },

  scope: {
    eyebrow: "What the list can and cannot tell you",
    title: "It suggests where to look first. It is not a verdict on any school.",
    lead: "A high rank means what is known about a school points to visiting it sooner. A low rank does not mean the school is fine. Only an inspection visit can establish the real facts.",
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
        "It does not replace an inspection visit.",
      ],
    },
  },

  method: {
    eyebrow: "How the list is made",
    title: "School need counts most.",
    lead: "The main method adds up a few factors for each school, each with a fixed share of the score. The research team set the shares before anyone looked at which schools came out on top.",
    sharesTitle: "What counts, and how much",
    shares: [
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
        name: "Four smaller factors",
        line: "How many people live within walking distance, air quality, nearby emissions and land cover.",
      },
    ],
    pathTitle: "Which schools are in the list",
    path: {
      records: {
        title: "School records gathered",
        note: "The records the study gathered, one for each school.",
      },
      inOrder: {
        title: "Can be put in order",
        note: "A school that lacks an air-quality figure shows a range of ranks instead of one. The tool does not guess the figure.",
      },
      toVerify: {
        title: "Need verifying first",
        note: "Each shows what to verify. Not being in the list yet does not mean need is low.",
      },
      visit: {
        title: "Then a visit or a check",
        note: "Only an inspection visit can establish the real facts. A record that is checked can then be put in order.",
      },
    },
    pathCaption:
      "How a school record reaches the list, redrawn in plain words from the research paper's workflow figure.",
    checksTitle: "Two checks on the method",
    checks: [
      {
        title: "The urgency rating is left out.",
        body: "The original school data came with an urgency rating. No one could trace how it was made, so the main method leaves it out. The tool keeps it one click away, as a check.",
      },
      {
        title: "A test with the shares changed at random.",
        body: "The research team changed the shares at random, many times over, and noted which schools stayed in the top 20 each time. It shows how much the list depends on the chosen shares, not what a visit will find.",
      },
    ],
  },

  use: {
    eyebrow: "How to use it",
    title: "Start with your province.",
    steps: [
      {
        title: "Find your province.",
        body: "Open the list and choose Province. Pick a province or a district, or type part of a school's name.",
      },
      {
        title: "Share or print a list.",
        body: "The web address keeps what you chose, so a link you send opens the same list. Download or print the list for a meeting, with the method and the date at the top.",
      },
      {
        title: "Follow the guides.",
        body: "Short guides in the tool show how to read each part of the screen. To see them again, choose Help, then Guides.",
      },
    ],
    guides: "Open the guides",
  },

  research: {
    eyebrow: "The research behind it",
    title: "A decision-support case study, still under review.",
    lead: "The list follows a research paper by the project's research team. The paper calls the work a documented decision-support case study in choosing schools to inspect when the evidence is incomplete.",
    data: {
      title: "The data",
      sentences: [
        "The study uses the records gathered for secondary schools in Papua New Guinea: classrooms, teacher housing, facilities, power, water and remoteness.",
        "It adds district figures, such as the share of students moving on from Grade 7, and mapped measures of walking reach, air quality, nearby emissions and land cover.",
        "The study does not claim that the records cover every school in the country.",
      ],
    },
    limits: {
      title: "The limits",
      sentences: [
        "The study had no independent checks of school condition or location.",
        "So the list cannot show true need, or what a visit would achieve.",
        "No one outside the project has reproduced the results yet, and planners have not yet tested the tool.",
      ],
    },
    status: {
      title: "Where the paper stands",
      sentences: [
        "The research team is still reviewing the paper.",
        "It has yet to decide whether to change the main method.",
      ],
    },
  },

  footer: {
    about: "RISE-PNG is a decision-support tool for screening secondary schools in Papua New Guinea.",
    caveat: STRINGS.caveatShort,
    navLabel: "More on this site",
    links: {
      open: "Open the list",
      how: "How the list is made",
      use: "How to use it",
      research: "The research behind it",
      queue: "Schools not in the list yet",
      guides: "Open the guides",
    },
  },
});

/**
 * One figure: the number as shown, what it counts worded to read after it in the hero's card, and the title of its
 * box in the path of a record, which agrees with the number.
 */
export interface Figure {
  readonly key: "records" | "inOrder" | "toVerify";
  readonly value: string;
  readonly label: string;
  readonly title: string;
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
      title: plural(records, "School record gathered", HOME.method.path.records.title),
    },
    {
      key: "inOrder",
      value: formatCount(inOrder),
      label: "can be put in order now",
      title: HOME.method.path.inOrder.title,
    },
    {
      key: "toVerify",
      value: formatCount(toVerify),
      label: plural(toVerify, "needs its record verified first", "need their records verified first"),
      title: plural(toVerify, "Needs verifying first", HOME.method.path.toVerify.title),
    },
  ];
}
