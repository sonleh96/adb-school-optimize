"use client";

import Image from "next/image";
import { useState } from "react";

import { CountrySchoolExplorer } from "@/components/CountrySchoolExplorer";
import { DistrictExplorer } from "@/components/DistrictExplorer";
import { MethodologyPanel } from "@/components/MethodologyPanel";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { SchoolExplorer } from "@/components/SchoolExplorer";

type TabKey = "country_schools" | "schools" | "districts" | "scenarios" | "methodology";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "country_schools", label: "All Schools" },
  { key: "schools", label: "School Explorer" },
  { key: "districts", label: "District Explorer" },
  { key: "scenarios", label: "Scenario Lab" },
  { key: "methodology", label: "Methodology" },
];

export function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabKey>("country_schools");

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

      <section className="hero">
        <span className="hero-topline">RISE-PNG Decision Support</span>
        <div className="hero-grid">
          <div>
            <h1>Prioritize the secondary schools where RISE-PNG investment will have the greatest impact.</h1>
            <p>
              RISE-PNG will refurbish and expand existing secondary schools in Papua New Guinea by
              adding classrooms, dormitories, and WASH facilities. Because the project focuses on
              upgrading existing Grades 7 to 10 schools rather than building new greenfield sites,
              the core decision is which schools should be prioritized. This tool is designed to
              identify and rank a shortlist of roughly 50 to 60 schools where ADB investment can
              most effectively expand access, reduce dropout, and support learning quality and
              gender equity outcomes.
            </p>
          </div>
        </div>
      </section>

      <nav className="tabs" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            className="tab-button"
            key={tab.key}
            type="button"
            data-active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="dashboard-grid">
        {activeTab === "country_schools" ? <CountrySchoolExplorer /> : null}
        {activeTab === "schools" ? <SchoolExplorer /> : null}
        {activeTab === "districts" ? <DistrictExplorer /> : null}
        {activeTab === "scenarios" ? <ScenarioPanel /> : null}
        {activeTab === "methodology" ? <MethodologyPanel /> : null}
      </section>
    </main>
  );
}
