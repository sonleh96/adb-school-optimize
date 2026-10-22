/** Short interface words, keyboard hints and help-mode words, so every screen names the same controls the same way. */
import { countWord } from "./counts";
import { formatCount, joinList, lowerFirst, plural, slug } from "./format";
import type { CopyRuleId } from "./model";
import { RULE_IDS, rule } from "./rules";
import { type Segments, nameSegment, seg, textOf } from "./segments";

/** The remove button's name for a saved view, with the name a person gave the view marked. */
export const removeViewSegments = (name: string): Segments =>
  seg`Remove the saved view ${nameSegment(name, "saved-view")}`;
/** A saved view's own name as a heading: all of it is a name. */
export const savedViewSegments = (name: string): Segments => [nameSegment(name, "saved-view")];

/** What a saved view's key names, in plain words, and what the screen shows when the data no longer has it. */
const LOST: Readonly<Record<string, { readonly missing: string; readonly instead: string } | undefined>> = {
  rule: { missing: "the rule", instead: "the paper's main rule" },
  compare: { missing: "the other rule in the comparison", instead: "no comparison" },
  school: { missing: "the school", instead: "no school selected" },
  prov: { missing: "the province", instead: "no province filter" },
  loc: { missing: "the remoteness class", instead: "no remoteness filter" },
};

// Short interface words, so every variant names the same controls the same way.
export const LAYOUT = Object.freeze({
  otherRules: "Other rules",
  from: "From",
  to: "To",
  withUrgency: "With urgency",
  withoutUrgency: "Without urgency",
  guides: "Guides",
  changeDone: "Done",
  // The one plain line of the quiet rule area: how the list is ordered under a rule, with no symbol or term of art.
  ruleNow: (id: CopyRuleId) => rule(id).plain,
  // The same for the first screen: what comes first, in a line or two with no percentages. `ruleNow` has the shares.
  ruleNowShort: (id: CopyRuleId) => rule(id).plainShort,
  help: "Help",
  helpAria: "Help and guides",
  amongAll124: "Among all schools that can be put in order",
  orderedTab: "The list",
  incompleteTab: "Missing information",
  legendNoAirQuality: "No air-quality figure",
  legendIncomplete: "Missing information",
  workspaceHint: "Select a school to see why it is where it is in the list.",
  tooltipHint: "Select to see why",
  missingFilters: "Missing details",
  groupBy: "Group by",
  // Moved from the final design's REQ object in round 4; same text, same shapes.
  methodSwitch: "For researchers: show method details",
  otherRulesCount: (n: number) => `Other ways to order the list (${n})`,
  // The control that opens the full choice of how the list is ordered, from the one line that says how it is today.
  orderControl: "Change how the list is ordered",
  // The narrow layout's choice between the list and the map band.
  paneAria: "Show the list or the map",
  paneList: "List",
  paneMap: "Map",
  rulePair: "How the list is ordered",
  howBack: "Back to the map",
  showMe: "Show me on the screen",
  // From the screen opened on the main rule, which leaves urgency out: the link to the comparison with the rule that
  // puts the urgency rating back.
  seeWithUrgency: "See what changes if the urgency rating is added back",
  backToCirculated: (label: string) => `Back to ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  backToMainRule: "Back to the paper's main rule",
  whatChanged: "What changed",
  hideComparison: "Hide this comparison",
  fullComparison: "See the full comparison",
  example: "Example",
  whyKey: "Why",
  rowHintQueue: "Select a school to see what information is missing.",
  why: "Why it sits here",
  whatMissing: "What is missing",
  recordSays: "What the record says",
  numbers: "In numbers",
  adds: "What each item adds",
  // A row of that table, named for what it is: the part of the score an input gives, not the input's own value.
  addedBy: (label: string) => `Added by ${lowerFirst(label)}`,
  // A part of school need under the row of what school need adds: what the part adds, not the part's own value, which
  // keeps the part's plain name (under the need-first rules, where the number is the value).
  partAdds: (label: string) => `Of that, ${lowerFirst(label)}`,
  needParts: "Parts of school need",
  byProvince: "Province",
  /** The heading of the group of incomplete records whose province is blank. */
  provinceNotRecorded: "Province not recorded",
  savedViews: "Saved views for meetings",
  notComputedGroup: (name: string, n: number) => `Not computed under ${name} (${n})`,
  listTitle: (n: number, name: string) => `Top list: the first ${n} under ${name}`,
  // The plain download's name: the list's length and the rule's plain label, with no rule letters.
  topListFileName: (n: number, ruleLabel: string) => `rise-png-top-${n}-${slug(ruleLabel)}.csv`,
  // In the export sheet, when a remoteness filter is on screen: the API cannot cut the file by remoteness.
  fileNotByRemoteness:
    "The file follows the province filter but not the remoteness filter, so it can list schools you do not see here.",
  rulesInPack: "Rules the saved views use",
  sharedRecord: "Shared by every list in the saved views",
  fingerprints: (n: number) =>
    n === 1
      ? "1 source file. The downloaded file names it with its fingerprint."
      : `${n} source files. The downloaded file names each one with its fingerprint.`,
  downloadPack: "Download the saved views",
  copyRecord: "Copy the method record",
  shares: "How the rule adds up",
  afterDownload: (what: string) => `Downloaded ${what}. The method record is in the first lines of the file.`,
  saveView: "Save this view",
  viewName: "Name this view",
  present: "Presentation mode",
  stopPresenting: "Leave presentation mode",
  presentationMode: "Presentation mode",
  stopPresentationMode: "Leave presentation mode",
  viewOf: (i: number, n: number) => `Saved view ${i} of ${n}`,
  meetingScript: "Meeting script",
  // Round 6: product, landmarks and states.
  howTitle: "How this works",
  productName: "RISE-PNG",
  productSub: "Which secondary schools to look at first",
  logoAria: "ADB logo",
  /** The letters in the logo. */
  logoMark: "ADB",
  mapAria: "Map of secondary schools in Papua New Guinea",
  workspaceAria: "Screening workspace",
  tabsAria: "List",
  listAria: "Schools",
  attribution: "\u00a9 OpenStreetMap contributors, \u00a9 CARTO",
  mapbarAria: "Guidance and map",
  legendAria: "Map key",
  selectedSchool: "Selected school",
  prevSchool: "Previous school",
  nextSchool: "Next school",
  notInList: "Not in the list",
  positionOf: (i: number, n: number) => `${i} of ${n}`,
  placeTo: "to",
  placeRange: (a: string, b: string) => `${a} to ${b}`,
  valueRange: (lo: string, hi: string) => `${lo} to ${hi}`,
  underRule: (label: string, ruleName: string) => `${label} under ${ruleName}`,
  emptyFiltered: "No school that can be put in order matches these filters.",
  emptyIncompleteFiltered: "No school with missing information matches these filters.",
  groupMany: (n: number) => `${n} ${plural(n, "kind", "kinds")} of detail missing`,
  // Loading the schools, and loading the map under them.
  loading: "Loading the schools",
  // A comparison of two rules, and the top-list file the export sheet reads.
  loadingComparison: "Loading the comparison",
  loadingTopList: "Loading the top list",
  mapLoading: "Loading the map",
  tooltipMissing: (labels: string) => `Missing: ${labels}`,
  tipNotComputed: (shortName: string) => `Not computed for this school under ${shortName}`,
  downloadKindAria: "What to download",
  recordCopied: "Method record copied",
  linksCopied: "Links to the saved views copied",
  savedToast: (n: number) => `Saved as view ${n}`,
  // The saved views list: nothing in it (in the rail and in the export sheet's tab), and the way back to the four
  // that come with the screen. Restoring asks first only when it would drop a view a person saved.
  noViews: "There are no saved views yet. Give the screen a name and save it, and it will be listed here.",
  resetViews: "Restore the starting views",
  resetViewsConfirm: "Remove my views and restore the starting ones",
  keepViews: "Keep my views",
  viewsRestored: "Starting views restored",
  // Shown when the list holds the most a person can keep, beside the Save button that is then unavailable.
  viewsFull: (max: number) =>
    `The list holds ${max} saved views, the most you can keep. Remove a view first to save another.`,
  // Shown when a saved view names something the loaded data no longer has. The keys are the screen's own
  // (rule, compare, school, hover, prov, loc); they are said in plain words, with what the screen shows instead.
  // `placement` is the view's stored range placement: it needs nothing from the data, so when it is not the default
  // ("upper", the sensitivity order) the sentence says it still applies.
  viewPartMissing: (keys: readonly string[], placement?: string | null) => {
    const found = [...new Set(keys.map((k) => (k === "hover" ? "school" : k)))].map((k) => {
      const words = LOST[k];
      if (!words) throw new Error(`No words for a saved view's ${k}`);
      return words;
    });
    return `Part of this view could not be reopened: ${joinList(found.map((w) => w.missing))} ${plural(found.length, "is", "are")} no longer in the data, so the screen shows ${joinList(found.map((w) => w.instead))} instead${placement === "upper" ? ", and the order it saved for the schools that show a range still applies" : ""}.`;
  },
  removeView: (name: string) => textOf(removeViewSegments(name)),
  afterDownloadList: "Downloaded the top list. The method record is in the first lines of the file.",
  afterDownloadPack:
    "Downloaded the saved views for meetings. The method record is in the first lines of the file.",
  copyNotDone: "That did not copy. Select the text and copy it by hand.",
  copyAllLinks: "Copy all links",
  copyLink: "Copy link",
  linkCopied: "Link to this screen copied",
  linkNotCopied: "The link did not copy. Copy the address from your browser's address bar instead.",
  // The narrow layout.
  menu: "Menu",
  keyLabel: "Key",
  keyShow: "Show the map key",
  keyHide: "Hide the map key",
  // The compact key over the map: the control that opens the full key, and the words beside each mark.
  keyMore: "What the map shows",
  keyLess: "Hide the full key",
  keyDot: "One rank",
  keyRange: "A range of ranks",
  keyRing: "Not in the list yet",
  // The colour strip covers the schools with one rank, so it can end below the number of schools in the list; the
  // schools with a range are shown apart. `n` is the number of schools with one rank.
  keyRamp: (first: string, last: string, n?: number) =>
    `Darker is earlier in the list: ${first} to ${last}${
      n === undefined
        ? ""
        : `, among ${n === 1 ? "the one school" : `the ${formatCount(n)} schools`} with one rank`
    }`,
  // Why the strip's last rank is not the number of schools in the list.
  keyRampNote: (n: number, range: number) =>
    range > 0
      ? `The colours show the ${formatCount(n)} ${plural(n, "school", "schools")} with one rank. The ${formatCount(range)} ${plural(range, "school", "schools")} with a range of ranks ${plural(range, "is", "are")} shown apart.`
      : `The colours show all ${formatCount(n)} ${plural(n, "school", "schools")} in the list.`,
  // What the compact strip says beside its swatches instead of a first and last rank, which can end below the number
  // of schools in the list. `keyRamp` and `keyRampNote` keep the exact numbers, for the full key and the screen reader.
  keyStrip: "Darker: earlier in the list",
  // The dark numbered circles on the map.
  keyNumbers: "Numbered: the first ten in the list",
  // An empty or failed load: one sentence and Retry.
  emptyData: "No schools came back, so there is nothing to show until you try again.",
  loadFailed: "Some of the information did not load, so there is nothing to show until you try again.",
  retry: "Retry",
  // The heading of the school column in the export table.
  schoolHead: "School",
  retrying: "Trying again",
  availableAfterLoad: "Available once the schools are on screen.",
  // The map's keyboard route, a background that did not load, a list that did not refresh, and an ended session.
  mapKeyboard: "To choose a school with the keyboard, use the list or the schools with missing information.",
  basemapUnavailable: "The map's background did not load. The schools and the list still work.",
  refreshFailed: "The list did not refresh, so this is the last one that loaded.",
  sessionEnded: "Your session has ended.",
  signIn: "Sign in again",
  signOut: "Sign out",
  // The guide, How this works and the glossary while their copy loads. A failed load says loadFailed, with Retry.
  loadingGuide: "Loading the guide",
  loadingHow: "Loading How this works",
  loadingGlossary: "Loading the glossary",
});

// Keyboard hints. Plain views show them only in presentation mode.
export const KEYS = Object.freeze({
  pageDown: "PgDn",
  pageHint: "Page Down for next",
  esc: "Esc",
  tabEnter: "Tab to an item and press Enter",
});

// Help mode and glossary words, moved from the final design's explain.js in round 4.
export const HELP = Object.freeze({
  explain: "Explain this screen",
  explaining: "Explaining this screen",
  glossary: "Glossary of terms",
  bar: "Select any underlined item to see what it means.",
  // Keyboard wording, for presentation mode and keyboard users only.
  barKeys: "Select any underlined item to see what it means, or Tab to it and press Enter.",
  done: "Done",
  esc: "Esc",
  find: "Find a term",
  none: "No term matches.",
  adds: "What adds most to its score",
  others: "Everything else",
  inData: "In this data",
  keep: "Keep in mind",
  readMore: "Read more",
  readLess: "Show less",
  inGlossary: "In the glossary",
  showOnMap: "Show on map",
  showWhere: "Show where",
  close: "Close",
  rules: `The ${countWord(RULE_IDS.length)} rules`,
  liveOn: (n: number) =>
    `Explaining this screen. ${n} ${plural(n, "item", "items")} can be explained. Press Escape to leave.`,
  liveOff: "Stopped explaining.",
});
