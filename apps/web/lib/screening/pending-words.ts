/**
 * TODO(w7-copy): draft words for the first-time screen's new controls, kept here until the copy owner's keys land
 * (`.audit-work/build/screening-20261020/w7-words-needed.md`). Each entry names the key it becomes. Once the copy
 * lands, every use moves to the copy and this file goes.
 */
export const PENDING = Object.freeze({
  /** LAYOUT.help */
  help: "Help",
  /** LAYOUT.helpAria */
  helpAria: "Help and guides",
  /** GUIDE.hide */
  hide: "Hide",
  /** GUIDE.hideAria */
  hideAria: "Hide the guides",
  /** GUIDE.startLede: what the tool is for, without the caveat the screen shows once elsewhere */
  startLede: "This tool lists the schools to look at first, with the main reason for each.",
  /** GUIDE.firstNote and GUIDE.returningNote */
  guidesBack: "To see the guides again, choose Help, then Guides.",
  /** LAYOUT.ruleNow */
  ruleNow: (name: string, main: boolean) =>
    main
      ? "Schools are listed by the main rule, which leaves out the uncertain urgency rating."
      : `Schools are listed by another rule: ${name}.`,
  /** LAYOUT.keyDot, LAYOUT.keyRange, LAYOUT.keyRing */
  keyDot: "One place",
  keyRange: "A range of places",
  keyRing: "Not in order yet",
  /** LAYOUT.keyMore, LAYOUT.keyLess */
  keyMore: "What the map shows",
  keyLess: "Hide the full key",
});
