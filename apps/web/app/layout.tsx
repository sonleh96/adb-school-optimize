import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Inter, Space_Grotesk, Spectral } from "next/font/google";

import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const proseFont = Spectral({
  subsets: ["latin"],
  variable: "--font-prose",
  weight: ["400", "500", "600"],
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
      <body className={`${displayFont.variable} ${bodyFont.variable} ${proseFont.variable}`}>
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
