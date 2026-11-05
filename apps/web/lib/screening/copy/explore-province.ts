/**
 * The words of the explore page's province section: where the schools of the list come from, where the top 20 are,
 * and why the records not in the list yet wait. Each count comes from the data the page binds
 * (`lib/explore/province.ts`), never from here.
 *
 * The records not in the list yet are records to verify before they can be put in order, never incomplete records:
 * some give every detail and record 0 classrooms in total.
 *
 * Nothing in the entry `./index` imports this file, so the workspace does not carry it.
 */
import { completePhrase, countWord, oneRange, rangePhrase } from "./counts";
import { capitalise, formatCount, joinList, plural } from "./format";
import type { CopyRuleId } from "./model";
import { ruleReads } from "./rules";
import { LAYOUT } from "./words";

/** "all 22 provinces", "21 of the 22 provinces": the provinces the schools of the list come from. */
const fromProvinces = (listed: number, provinces: number): string => {
  if (listed < provinces) return `${formatCount(listed)} of the ${formatCount(provinces)} provinces`;
  if (provinces === 1) return "the one province";
  return provinces === 2 ? "both provinces" : `all ${formatCount(provinces)} provinces`;
};

/** "and the top 20 from 10 of them", after the provinces of the list. */
const topFrom = (top: number, listed: number): string => {
  if (top === 0) return "";
  if (top < listed) return `, and the top 20 from ${top === 1 ? "one" : formatCount(top)} of them`;
  if (listed === 1) return ", the top 20 included";
  return `, and the top 20 from ${listed === 2 ? "both" : "all"} of them`;
};

/** Why the records not in the list yet wait, one group each: the verb for one record and for several. */
const GROUPS = [
  { key: "missing", one: "has a detail missing", many: "have a detail missing" },
  { key: "zero", one: "records 0 classrooms in total", many: "record 0 classrooms in total" },
  { key: "other", one: "needs checking for another reason", many: "need checking for another reason" },
] as const;

export const EXPLORE_PROVINCE = Object.freeze({
  question: "Where are the schools?",
  /**
   * The section's answer, in one sentence. `provinces` is how many provinces the records name, `listed` how many of
   * them have a school in the list, `top` how many have one in the top 20, and `unrecorded` how many schools in the
   * list give no province.
   */
  answer: (provinces: number, listed: number, top: number, unrecorded: number): string => {
    if (listed === 0)
      return unrecorded === 0
        ? "No school is in the list yet."
        : "No school in the list has a province recorded.";
    const missing =
      unrecorded === 0
        ? ""
        : `; ${formatCount(unrecorded)} ${plural(unrecorded, "school in the list has", "schools in the list have")} no province recorded`;
    return `The schools in the list come from ${fromProvinces(listed, provinces)}${topFrom(top, listed)}${missing}.`;
  },
  title: "Schools by province",
  /** How the rows are ordered, so a reader knows where to look for a province. */
  order: (unrecorded: boolean): string =>
    unrecorded ? "Provinces from A to Z, then the records with no province." : "Provinces from A to Z.",
  legend: Object.freeze({
    top: "In the top 20",
    others: "Other schools in the list",
    notYet: "Not in the list yet",
  }),
  columns: Object.freeze({ inList: "In the list", notYet: "Not in the list yet" }),
  /** The row of the records that give no province. */
  unrecorded: LAYOUT.provinceNotRecorded,
  /** What the top 20 counts, under the rule shown, from how many schools have a single rank. */
  top: (complete: number, ruleId: CopyRuleId): string => {
    if (complete >= 20)
      return `The top 20 are the first 20 ranks in the list, among ${completePhrase({ complete }, ruleReads(ruleId))}.`;
    if (complete === 0) return "No school has a single rank, so none is in the top 20.";
    return complete === 1
      ? "Only one school has a single rank, so it is the only one in the top 20."
      : `Only ${formatCount(complete)} schools have a single rank, so all of them are in the top 20.`;
  },
  /**
   * How the schools that show a range are counted, and how many of them have possible ranks that reach the top 20.
   * Null when no school shows a range.
   */
  ranges: (range: number, reach: number): string | null => {
    if (range === 0) return null;
    const c = { range };
    const one = oneRange(c);
    const counted = `${capitalise(rangePhrase(c))} ${one ? "has" : "have"} no single rank, so the chart counts ${one ? "it" : "them"} with the other schools in the list.`;
    if (reach === 0) return counted;
    const whose = one
      ? "Its possible ranks reach"
      : reach < range
        ? `The possible ranks of ${countWord(reach)} of them reach`
        : `The possible ranks of ${range === 2 ? "both" : `all ${countWord(range)}`} reach`;
    return `${counted} ${whose} the top 20.`;
  },
  /**
   * The records not in the list yet, by the first reason that holds, with the rule that counts each record once.
   * `other` is every record held for another reason than a missing detail or 0 classrooms.
   */
  reasons: (queue: number, missing: number, zero: number, other: number): string => {
    if (queue === 0) return "No record needs verifying, so every school is in the list.";
    const counts = { missing, zero, other };
    const said = GROUPS.filter((group) => counts[group.key] > 0);
    const split =
      queue === 1
        ? `The one record not in the list yet ${said[0].one}.`
        : said.length === 1
          ? `${queue === 2 ? "Both" : `All ${formatCount(queue)}`} records not in the list yet ${said[0].many}.`
          : `Of the ${formatCount(queue)} records not in the list yet, ${joinList(
              said.map((group) => {
                const n = counts[group.key];
                return `${formatCount(n)} ${n === 1 ? group.one : group.many}`;
              })
            )}.`;
    return [
      split,
      missing > 0
        ? "A record that has a detail missing and also records 0 classrooms counts once, with the detail missing."
        : null,
      zero > 0 ? "A recorded 0 needs checking; it is not a blank." : null,
      "Not being in the list yet does not mean a school's need is low.",
    ]
      .filter((sentence): sentence is string => sentence !== null)
      .join(" ");
  },
  /** Where the marked school is: its province and how many schools in the list it shares it with. */
  marked: (province: string | null, inList: number): string => {
    const others = inList - 1;
    if (province === null)
      return others < 1
        ? "Its record gives no province."
        : `Its record gives no province, and neither ${plural(others, "does", "do")} ${formatCount(others)} other ${plural(others, "school", "schools")} in the list.`;
    return others < 1
      ? `It is the one school in the list from ${province}.`
      : `It is one of ${formatCount(inList)} schools in the list from ${province}.`;
  },
  table: Object.freeze({
    province: "Province",
    inList: "In the list",
    top: "In the top 20",
    notYet: "Not in the list yet",
    total: "Total",
    reasons: "Records not in the list yet, by reason",
    missing: "Detail missing",
    zero: "0 classrooms",
    other: "Other reason",
  }),
});
