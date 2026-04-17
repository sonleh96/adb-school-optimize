"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/all-schools", label: "Overview" },
  { href: "/school-explorer", label: "School Explorer" },
  { href: "/district-explorer", label: "District Explorer" },
  { href: "/scenario-lab", label: "Scenario Lab" },
  { href: "/methodology-lab", label: "Methodology" },
];

export function DashboardPageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-header-main">
          <div className="brand-block">
            <Image
              src="/adb-logo.png"
              alt="Asian Development Bank"
              width={960}
              height={960}
              priority
              className="adb-logo-image"
            />
            <span className="brand-copy">Asian Development Bank</span>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <Link className="tab-button" key={tab.href} href={tab.href} data-active={pathname === tab.href}>
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="dashboard-grid">{children}</section>
    </main>
  );
}
