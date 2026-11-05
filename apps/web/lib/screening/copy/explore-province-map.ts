/**
 * The words of the explore page's province map (components/explore/sections/ProvinceMap.tsx): which provinces have
 * schools in the top 20, shaded on a map of the 22 provinces, with a table of the same counts.
 *
 * The map counts each school in the province its record names. It never says where a school is: the study has no
 * independent check of school coordinates (the paper's Appendix F), so a point would claim more than the data holds.
 * Each count comes from the data the page binds, never from here.
 *
 * Nothing in the entry `./index` imports this file, so the workspace does not carry it.
 */
import { countWord } from "./counts";
import { capitalise, formatCount, joinList } from "./format";
import { LAYOUT } from "./words";

export const EXPLORE_MAP = Object.freeze({
  question: "Which provinces have schools in the top 20?",
  /**
   * The answer over the map: how many of the map's provinces hold schools of the top 20, and which hold the most.
   * `leaders` are the provinces with `most` schools, in alphabetical order.
   */
  answer: (holding: number, provinces: number, leaders: readonly string[], most: number) => {
    if (holding === 0) return "No province on the map has a school in the top 20.";
    if (holding === 1)
      return most === 1
        ? `Only ${leaders[0]} has a school in the top 20.`
        : `Only ${leaders[0]} has schools in the top 20, ${formatCount(most)} of them.`;
    const lead = `${formatCount(holding)} of the ${formatCount(provinces)} provinces have schools in the top 20`;
    if (most === 1) return `${lead}, one each.`;
    return leaders.length === 1
      ? `${lead}, and ${leaders[0]} has the most, ${formatCount(most)}.`
      : `${lead}, and ${joinList(leaders)} have the most, ${formatCount(most)} each.`;
  },
  location:
    "Each school counts in the province its record names, so the map shows provinces, not where each school is. The study has no independent check of school coordinates, as Appendix F of the paper notes.",
  /** The boundaries' licence asks for this credit wherever the map shows, as the homepage gives it. */
  credit: {
    text: "Boundaries: World Bank Official Boundaries, CC BY 4.0.",
    href: "https://datacatalog.worldbank.org/search/dataset/0038272",
  },
  legend: {
    title: "Schools in the top 20",
    /** Each shade's name, in the legend's order: the count bins from 0, then no school in the data. */
    shades: {
      "0": "0",
      "1": "1",
      "2": "2",
      "3": "3",
      "4": "4",
      "5+": "5 or more",
      none: "No schools in the data",
    },
    marked: "Province of the marked school",
  },
  /** The marked school's line, when its province is on the map. */
  marked: (school: string, province: string, count: number) =>
    `${school} is in ${province}, outlined on the map. ${province} has ${count === 0 ? "none" : formatCount(count)} of the top 20.`,
  /** The marked school's line, when its record names no province on the map. */
  markedOff: (school: string) =>
    `The record of ${school} names no province on this map, so none is outlined.`,
  /** The schools whose record names no province on the map, and how many of them are in the top 20. */
  offMap: (schools: number, top20: number) => {
    const one = schools === 1;
    const lead = one
      ? "The record of one school names no province on this map, so the map leaves it out."
      : `The records of ${formatCount(schools)} schools name no province on this map, so the map leaves them out.`;
    const inTop =
      top20 === 0
        ? ""
        : one
          ? " It is in the top 20."
          : ` ${top20 === schools ? "All of them are" : `${formatCount(top20)} of them ${top20 === 1 ? "is" : "are"}`} in the top 20.`;
    return `${lead}${inTop} The table lists ${one ? "it" : "them"} last.`;
  },
  /** The schools that show a range and could be in the top 20, which the map does not count. */
  ranges: (count: number) =>
    count === 1
      ? "One school that shows a range could also be in the top 20, depending on figures missing from its record. The map does not count it."
      : `${capitalise(countWord(count))} schools that show a range could also be in the top 20, depending on figures missing from their records. The map does not count them.`,
  failed: "The map did not load. The numbers below give every province's count.",
  table: {
    caption: "Schools in the top 20, by province",
    province: "Province",
    top20: "Schools in the top 20",
    none: "No schools in the data",
    offMap: "Not on the map",
    blank: LAYOUT.provinceNotRecorded,
  },
});
