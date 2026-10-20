/**
 * The workspace's few interim words: what the copy module does not word yet. Each one is a copy request; when the
 * copy module gains it, the entry moves there and leaves this file. Every other visible string comes from the copy
 * module, bound to the loaded data at the workspace's data boundary.
 */
export const COPY = {
  /** Told to the map's keyboard users after its name. */
  mapKeyboard: "To choose a school with the keyboard, use the list or the incomplete records.",
  basemapUnavailable: "The basemap could not be loaded. The marks and the list still work.",
  refreshFailed: "The list could not be refreshed. This is the last one that loaded.",
  /** An ended session has its own way out: signing in again, to a page that returns here. */
  signIn: "Sign in again",
  failure: { session: "Your session has ended." },
} as const;
