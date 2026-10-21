/** Short interface words, keyboard hints and help-mode words, so every screen names the same controls the same way. */
import { countWord } from "./counts";
import { lowerFirst, plural } from "./format";
import { RULE_IDS } from "./rules";
import { type Segments, nameSegment, seg, textOf } from "./segments";

/** The remove button's name for a saved view, with the name a person gave the view marked. */
export const removeViewSegments = (name: string): Segments =>
  seg`Remove the saved view ${nameSegment(name, "saved-view")}`;
/** A saved view's own name as a heading: all of it is a name. */
export const savedViewSegments = (name: string): Segments => [nameSegment(name, "saved-view")];

// Short interface words, so every variant names the same controls the same way.
export const LAYOUT = Object.freeze({
  otherRules: "Other rules",
  from: "From",
  to: "To",
  withUrgency: "With urgency",
  withoutUrgency: "Without urgency",
  guides: "Guides",
  change: "Change",
  amongAll124: "Among all schools that can be put in order",
  orderedTab: "The list",
  incompleteTab: "Incomplete records",
  legendNoAirQuality: "No air-quality reading",
  legendIncomplete: "Incomplete record",
  workspaceHint: "Select a school to see the reasons for its place in the list.",
  tooltipHint: "Select to see why",
  missingFilters: "Missing details",
  groupBy: "Group by",
  // Moved from the final design's REQ object in round 4; same text, same shapes.
  methodSwitch: "Show method details",
  otherRulesCount: (n: number) => `Other rules (${n})`,
  rulePair: "The two main rules",
  howBack: "Back to the map",
  showMe: "Show me on the screen",
  seeWithout: "See what changes without urgency",
  backToCirculated: (label: string) => `Back to ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  backToMainRule: "Back to the paper's main rule",
  whatChanged: "What changed",
  hideComparison: "Hide this comparison",
  fullComparison: "See the full comparison",
  example: "Example",
  whyKey: "Why",
  rowHintQueue: "Select a school to see what is missing from its record.",
  why: "Why it sits here",
  whatMissing: "What is missing",
  recordSays: "What the record says",
  numbers: "In numbers",
  adds: "What each input adds",
  // A row of that table, named for what it is: the part of the screening score an input gives, not the input's own value.
  addedBy: (label: string) => `Added by ${lowerFirst(label)}`,
  needParts: "Parts of school need",
  byProvince: "Province",
  /** The heading of the group of incomplete records whose province is blank. */
  provinceNotRecorded: "Province not recorded",
  savedViews: "Saved views for meetings",
  notComputedGroup: (name: string, n: number) => `Not computed under ${name} (${n})`,
  listTitle: (n: number, name: string) => `Top list: the first ${n} under ${name}`,
  rulesInPack: "Rules the saved views use",
  sharedRecord: "Shared by every list in the pack",
  fingerprints: (n: number) =>
    n === 1
      ? "1 source file. The downloaded file names it with its fingerprint."
      : `${n} source files. The downloaded file names each one with its fingerprint.`,
  downloadPack: "Download the pack",
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
  productSub: "Screening of secondary schools",
  logoAria: "ADB logo",
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
  emptyIncompleteFiltered: "No school with an incomplete record matches these filters.",
  groupMany: (n: number) => `${n} ${plural(n, "kind", "kinds")} of detail missing`,
  // Loading the schools, and loading the map under them.
  loading: "Loading the schools",
  mapLoading: "Loading the map",
  tooltipMissing: (labels: string) => `Missing: ${labels}`,
  tipNotComputed: (shortName: string) => `Not computed for this school under ${shortName}`,
  downloadKindAria: "What to download",
  recordCopied: "Method record copied",
  linksCopied: "Links to the saved views copied",
  savedToast: (n: number) => `Saved as view ${n}`,
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
  // An empty or failed load: one sentence and Retry.
  emptyData: "No schools came back, so there is nothing to show until you try again.",
  loadFailed: "Some of the information did not load, so there is nothing to show until you try again.",
  retry: "Retry",
  retrying: "Trying again",
  availableAfterLoad: "Available once the schools are on screen.",
  // The map's keyboard route, a background that did not load, a list that did not refresh, and an ended session.
  mapKeyboard: "To choose a school with the keyboard, use the list or the incomplete records.",
  basemapUnavailable: "The map's background did not load. The schools and the list still work.",
  refreshFailed: "The list did not refresh, so this is the last one that loaded.",
  sessionEnded: "Your session has ended.",
  signIn: "Sign in again",
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
  adds: "What adds most to its screening score",
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
