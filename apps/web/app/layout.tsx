import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import { QueryProvider } from "@/components/QueryProvider";

import "./globals.css";

// The sign-in page's headings and button. The screening workspace loads its own typefaces in its layout.
const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "RISE-PNG Dashboard",
    template: "%s | RISE-PNG",
  },
  description:
    "Decision-support dashboard for prioritizing secondary school investments in Papua New Guinea.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={displayFont.variable}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
