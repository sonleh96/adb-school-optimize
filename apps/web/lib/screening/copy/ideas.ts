/** The three ideas a first-time reader must learn, each with a title, a 25-word short form and a 60-word long form. */
import { capitalise, formatCount } from "./format";
import { countWord, known } from "./counts";
import type { CountBag } from "./model";

/* ------------------------------------------------------------ the 3 ideas */

// The three ideas for a set of counts; IDEAS is the count-free version.
// Each count fills the slot of one word, so the 25 and 60 word lengths hold either way.
export function buildIdeas(c: CountBag = {}) {
  const rangeLead = known(c, "range") && c.range > 1 ? capitalise(countWord(c.range)) : "Some";
  const queueLead = known(c, "queue") && c.queue > 1 ? formatCount(c.queue) : "Some";
  const queueOfAll =
    known(c, "queue") && known(c, "all") && c.queue > 1
      ? `${formatCount(c.queue)} of the ${formatCount(c.all)}`
      : "Some of the recorded";
  const ordered = known(c, "ranked") && c.ranked > 1 ? `the ${formatCount(c.ranked)}` : "all the";
  return Object.freeze({
    notVerdict: {
      title: "A place in the list is a suggestion, not a verdict",
      short:
        "A place in the list suggests which schools to inspect first under the chosen rule. It is not a verdict on condition, safety or funding.",
      long: "The list puts schools in the order a rule suggests for a closer look. A high place means the school's records, read through that rule, point to inspecting it sooner. It does not show that the school's buildings are in bad shape, and a low place does not mean it is fine. Only an inspection visit can establish the facts.",
    },
    ranges: {
      title: `${rangeLead} schools show a range because a reading is missing`,
      short: `${rangeLead} schools lack an air-quality reading, an air-pollution index for their location. They show the highest and lowest places they could take in the list.`,
      long: `${rangeLead} schools lack an air-quality reading, an air-pollution index for each school's location, and the tool does not guess it. It works out the highest and lowest places each one could take among ${ordered} schools that can be put in order. The list then shows them where they would sit if air quality added nothing to their screening score.`,
    },
    queue: {
      title: "Some schools have no place in the list yet because their records are incomplete",
      short: `${queueLead} schools have no place in the list yet because their records are incomplete. Each one shows what is missing. That says nothing about need.`,
      long: `${queueOfAll} schools have incomplete records, such as a blank power source or 0 classrooms recorded. School need is built from five parts of each school's record, so these schools cannot be put in order until someone checks them. Each school's entry shows what is missing. Having no place yet does not mean a school's need is low.`,
    },
  });
}
export const IDEAS = buildIdeas();
