import type { ReactNode } from "react";
import type { Metadata } from "next";

import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
