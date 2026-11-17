import type { ReactNode } from "react";
import type { Metadata } from "next";

import { SITE } from "@/lib/home/copy";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RISE-PNG Dashboard",
    template: "%s | RISE-PNG",
  },
  description: SITE.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
