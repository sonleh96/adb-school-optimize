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
  // One school reads in the singular, so the sentence never says "Some schools" of a single school.
  const oneRange = known(c, "range") && c.range === 1;
  const oneQueued = known(c, "queue") && c.queue === 1;
  const ofAll = known(c, "all") ? `the ${formatCount(c.all)}` : "the recorded";
  // None is said as none: the idea stays, and says what would happen, not that some school is in it.
  const noRange = known(c, "range") && c.range === 0;
  const noQueue = known(c, "queue") && c.queue === 0;
  return Object.freeze({
    notVerdict: {
      title: "A position in the list is a suggestion, not a verdict",
      short:
        "A position in the list suggests which schools to look at first under this method. It is not a verdict on condition, safety or funding.",
      long: "The list puts schools in the order a method suggests for a closer look. A high position means what is known about the school points to visiting it sooner. It does not show that the school's buildings are in bad shape, and a low position does not mean it is fine. Only an inspection visit can establish the real facts.",
    },
    ranges: noRange
      ? {
          title: "No school shows a range here, because every school has its readings",
          short:
            "No school lacks an air-quality reading, an air-pollution index for its location. One that did would show the highest and lowest positions it could take.",
          long: "No school lacks an air-quality reading, an air-pollution index for each school's location, so none shows a range here. A school that did would not have its missing reading guessed. The tool would work out the highest and lowest positions it could take among all the schools that can be put in order, listing it where air quality added nothing.",
        }
      : oneRange
        ? {
            title: "One school shows a range because a reading is missing",
            short:
              "One school lacks an air-quality reading, an air-pollution index for its location. It shows the highest and lowest positions it could take in the list.",
            long: `One school lacks an air-quality reading, an air-pollution index for the school's location, and the tool does not guess it. It works out the highest and lowest positions that school could take among ${ordered} schools that can be put in order. The list shows it where it would sit if air quality added nothing at all to its score.`,
          }
        : {
            title: `${rangeLead} schools show a range because a reading is missing`,
            short: `${rangeLead} schools lack an air-quality reading, an air-pollution index for their location. They show the highest and lowest positions they could take in the list.`,
            long: `${rangeLead} schools lack an air-quality reading, an air-pollution index for each school's location, and the tool does not guess it. It works out the highest and lowest positions each one could take among ${ordered} schools that can be put in order. The list shows them where they would sit if air quality added nothing at all to their score.`,
          },
    queue: noQueue
      ? {
          title: "No school is left out of the list because information about it is missing",
          short:
            "No school is left out of the list yet for any missing information. One would show what is missing. That says nothing about its need.",
          long: "No school has information missing, like a blank power source or 0 classrooms. School need is built from five parts of each school's information, so a school missing a part could not be put in order until someone checked it. Its entry would show what is missing. Not being in the list yet would not mean its need is low.",
        }
      : oneQueued
        ? {
            title: "One school is not in the list yet because information about it is missing",
            short:
              "One school is not in the list yet because information about it is missing. Its entry shows what is missing. That says nothing about need.",
            long: `One of ${ofAll} schools has information missing, such as a blank power source or 0 classrooms recorded. School need is built from five parts of each school's information, so this school cannot be put in order until someone checks it. Its entry shows what is missing. Not being in the list yet does not mean its need is low.`,
          }
        : {
            title: "Some schools are not in the list yet because information about them is missing",
            short: `${queueLead} schools are not in the list yet because information about them is missing. Each one shows what is missing. That says nothing about need.`,
            long: `${queueOfAll} schools have information missing, such as a blank power source or 0 classrooms. School need is built from five parts of each school's information, so these schools cannot be put in order until someone checks them. Each school's entry shows what is missing. Not being in the list yet does not mean their need is low.`,
          },
  });
}
export const IDEAS = buildIdeas();
