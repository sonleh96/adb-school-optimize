import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

// The screening workspace's three typefaces, loaded for this route only.
const serif = Newsreader({ subsets: ["latin"], variable: "--font-screening-serif" });
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-screening-sans",
});
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-screening-mono" });

export default function ScreeningLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      style={{ position: "absolute", inset: 0 }}
    >
      {children}
    </div>
  );
}
