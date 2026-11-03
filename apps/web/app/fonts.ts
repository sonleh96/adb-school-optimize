import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

// The workspace's three typefaces. The sign-in page loads the same ones, so the two screens read as one product.
// Only Plex Sans is preloaded: it is the one face the first screen sets, at every width. Newsreader (58 KB) and Plex
// Mono (22 KB) set the method details, the guides, help's keyboard keys and the export sheet, so a browser fetches each
// only when text in it first shows, and swaps it in. Preloaded, they took 80 KB from a phone's slow connection
// before the first school could show.
const serif = Newsreader({ subsets: ["latin"], variable: "--font-screening-serif", preload: false });
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-screening-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-screening-mono",
  preload: false,
});

/** Class names that define `--font-screening-serif`, `-sans` and `-mono` on the element that carries them. */
export const screeningFonts = `${serif.variable} ${sans.variable} ${mono.variable}`;

/**
 * The homepage sets everything in Plex Sans, its headlines at 600 with tight tracking, so it carries only that face:
 * the same files the workspace preloads, so a reader who goes on to the list already has them.
 */
export const homeFonts = sans.variable;
