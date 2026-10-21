import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

// The workspace's three typefaces. The sign-in page loads the same ones, so the two screens read as one product.
const serif = Newsreader({ subsets: ["latin"], variable: "--font-screening-serif" });
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-screening-sans",
});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-screening-mono" });

/** Class names that define `--font-screening-serif`, `-sans` and `-mono` on the element that carries them. */
export const screeningFonts = `${serif.variable} ${sans.variable} ${mono.variable}`;
