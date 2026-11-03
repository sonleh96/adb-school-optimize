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
  dist: { missing: "the district", instead: "no district filter" },
  loc: { missing: "the remoteness class", instead: "no remoteness filter" },
};

/** What the find control holds, in the words its sentence uses: a province, a district of it, part of a name. */
export interface FindWords {
  readonly province: string | null;
  readonly district: string | null;
  readonly name: string | null;
}

// Short interface words, so every variant names the same controls the same way.
export const LAYOUT = Object.freeze({
  otherRules: "Other rules",
  from: "From",
  to: "To",
  withUrgency: "With urgency",
  withoutUrgency: "Without urgency",
  guides: "Guides",
  // The one plain line of the quiet rule area: how the list is ordered under a rule, with no symbol or term of art.
  ruleNow: (id: CopyRuleId) => rule(id).plain,
  // The same for the first screen: what comes first, in a line or two with no percentages. `ruleNow` has the shares.
  ruleNowShort: (id: CopyRuleId) => rule(id).plainShort,
  help: "Help",
  helpAria: "Help and guides",
  amongAll124: "Among all schools that can be put in order",
  orderedTab: "The list",
  incompleteTab: "Not in the list yet",
  legendNoAirQuality: "No air-quality figure",
  legendIncomplete: "Not in the list yet",
  workspaceHint: "Select a school to see why it is where it is in the list.",
  tooltipHint: "Select to see why",
  missingFilters: "What to verify",
  groupBy: "Group by",
  // Moved from the final design's REQ object in round 4; same text, same shapes.
  methodSwitch: "For researchers: show method details",
  otherRulesCount: (n: number) => `Other ways to order the list (${n})`,
  // The control that opens the full choice of how the list is ordered, from the one line that says how it is today.
  orderControl: "Change how the list is ordered",
  // The narrow layout's choice between the list and the map band.
  paneAria: "Show the list or the map",
  // The first stop for the keyboard: past the map, its buttons and the guides, straight to the first school.
  skipToList: "Skip to the list",
  paneList: "List",
  paneMap: "Map",
  rulePair: "How the list is ordered",
  howBack: "Back to the map",
  showMe: "Show me on the screen",
  // From the screen opened on the main rule, which leaves urgency out: the link to the comparison with the rule that
  // puts the urgency rating back.
  seeWithUrgency: "Compare with the earlier method, which also counts an urgency rating",
  // Beside that link on the first screen: why the main method leaves the rating out, in one plain line.
  urgencyWhy: "Nobody could trace how that rating was made, so the main method leaves it out.",
  backToCirculated: (label: string) => `Back to ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  backToMainRule: "Back to the paper's main rule",
  whatChanged: "What changed",
  hideComparison: "Hide this comparison",
  fullComparison: "See the full comparison",
  example: "Example",
  whyKey: "Why",
  rowHintQueue: "Select a school to see what to verify.",
  why: "Why it sits here",
  whatMissing: "What to verify",
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
  // The find control on the plain screen: a province, a district of it, and part of a school's name. The button's own
  // word is short; its full name, the panel's title, says what it finds by.
  find: "Find",
  findAria: "Find schools by province, district or name",
  district: "District",
  schoolName: "School name",
  allProvinces: "All provinces",
  allDistricts: "All districts",
  clearFind: "Clear",
  // How many schools the find control leaves, of how many, and what it holds. `of` is the tab: the list, or the
  // records to verify. "3 of the 31 schools in the list are in Highlands."
  findShowing: (shown: number, total: number, of: "list" | "queue", find: FindWords) => {
    const one = shown <= 1;
    const group = (n: number) =>
      of === "queue"
        ? plural(n, "record to verify", "records to verify")
        : plural(n, "school in the list", "schools in the list");
    const where = find.province
      ? `${one ? "is" : "are"} in ${find.district ? `${find.district}, ${find.province}` : find.province}`
      : null;
    const named = find.name
      ? `${one ? "has" : "have"} "${find.name}" in ${one ? "its" : "their"} name`
      : null;
    const parts = [where, named].filter((part): part is string => part !== null);
    // Nothing to find by: the whole group, as the tab counts it.
    if (parts.length === 0) return `${formatCount(total)} ${group(total)}.`;
    const holds = joinList(parts);
    if (shown === 0) return `No ${group(1)} ${holds}.`;
    if (shown === total)
      return total === 1
        ? `The one ${group(1)} ${holds}.`
        : `All ${formatCount(total)} ${group(total)} ${holds}.`;
    return `${formatCount(shown)} of the ${formatCount(total)} ${group(total)} ${holds}.`;
  },
  findNoneHint: "Check the spelling, or choose another province or district.",
  /** The heading of the group of incomplete records whose province is blank. */
  provinceNotRecorded: "Province not recorded",
  savedViews: "Saved views for meetings",
  notComputedGroup: (name: string, n: number) => `Not computed under ${name} (${n})`,
  listTitle: (n: number, name: string) => `Top list: the first ${n} under ${name}`,
  // The plain download's name: the list's length and the rule's plain label, with no rule letters.
  topListFileName: (n: number, ruleLabel: string) => `rise-png-top-${n}-${slug(ruleLabel)}.csv`,
  // The plain download: the list on screen, by the day it is made and, when the screen shows one province or
  // district, by that too.
  listFileName: (ruleLabel: string, day: string, where: string | null) =>
    `rise-png-list-${where ? `${slug(where)}-` : ""}${slug(ruleLabel)}-${day}.csv`,
  // What the plain download holds, the rows its sheet shows of them, and the line every copy of the list starts with:
  // the file and the printout alike.
  listLede: (n: number) =>
    n === 0
      ? "No school is on screen, so there is nothing to download. Clear the search to see every school."
      : n === 1
        ? "A spreadsheet of the one school on screen, with the main reason it is where it is in the list."
        : `A spreadsheet of the ${formatCount(n)} schools on screen, in order, with the main reason for each.`,
  listFirstLine: "Its first line names the method, the date and the data version.",
  listMore: (n: number) => `And ${formatCount(n)} more in the file.`,
  listMade: (name: string, label: string, day: string, version: string) =>
    `Schools to look at first under ${name} (${label}), made on ${day} from data version ${version}.`,
  rankHead: "Rank",
  printList: "Print the list",
  // The research team's file, the API's own: the plain sheet's second choice and the method sheet's download.
  researchFile: "Download the research file",
  forResearchers: "For researchers",
  researchNote: (k: number) =>
    `The research team's file of the first ${k} schools under this method, with every input, score and source fingerprint, so anyone can rebuild the list.`,
  researchNotByName: "It follows the province and district, but not the name search.",
  researchFailed: "The research file did not download.",
  loadingResearch: "Getting the research file",
  afterDownloadPlain: "Downloaded the list. Its first line names the method, the date and the data version.",
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
  placeTo: "to",
  placeRange: (a: string, b: string) => `${a} to ${b}`,
  valueRange: (lo: string, hi: string) => `${lo} to ${hi}`,
  underRule: (label: string, ruleName: string) => `${label} under ${ruleName}`,
  emptyFiltered: "No school that can be put in order matches these filters.",
  emptyIncompleteFiltered: "No record to verify matches these filters.",
  groupMany: (n: number) => `${n} ${plural(n, "kind", "kinds")} of detail missing`,
  // Loading the schools, and loading the map under them.
  loading: "Loading the schools",
  // Under that line once loading has taken a few seconds: a slow connection, not a broken page.
  stillLoading: "Still loading. On a slow connection this can take up to a minute.",
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
  afterDownloadList: "Downloaded the research file. The method record is in the first lines of the file.",
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
  // The compact key over the map: the control that opens the full key, and the words beside each mark.
  keyMore: "What the map shows",
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
  keyNumbers: "Numbered: ranks 1 to 10",
  // An empty or failed load: one sentence and Retry.
  emptyData: "No school data has been loaded yet, so there is no list to show.",
  staleRun:
    "The saved results are out of date with this version of the tool, so there is no list to show until the team that runs it loads the data again.",
  loadFailed: "Some of the information did not load, so there is nothing to show until you try again.",
  retry: "Retry",
  // The heading of the school column in the export table.
  schoolHead: "School",
  retrying: "Trying again",
  // The empty store and a stale run: asking again does not fix either until the data is loaded again, so the button
  // checks and promises nothing.
  checkAgain: "Check again",
  checkingAgain: "Checking again",
  availableAfterLoad: "Available once the schools are on screen.",
  // The map's keyboard route, a background that did not load, a list that did not refresh, and an ended session.
  mapKeyboard: 'To choose a school with the keyboard, use the list or the "Not in the list yet" tab.',
  basemapUnavailable: "The map's background did not load. The schools and the list still work.",
  refreshFailed: "The list did not refresh, so this is the last one that loaded.",
  refreshStale: "The results for this rule are out of date, so this is the last list that loaded.",
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
