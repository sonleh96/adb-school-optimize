"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchScenarios } from "@/lib/api";
import { SELECTED_SCENARIO_STORAGE_KEY } from "@/lib/scenarioSelection";

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/all-schools", label: "Overview" },
  { href: "/school-explorer", label: "School Explorer" },
  { href: "/district-explorer", label: "District Explorer" },
  { href: "/scenario-lab", label: "Scenario Lab" },
  { href: "/methodology-lab", label: "Methodology" },
];

function ActiveScenarioBadge() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = window.localStorage.getItem(SELECTED_SCENARIO_STORAGE_KEY);
    if (!id) {
      return;
    }
    fetchScenarios()
      .then((scenarios) => {
        if (cancelled) return;
        const active = scenarios.find((s) => s.scenario_id === id);
        if (active) setLabel(active.scenario_name);
      })
      .catch(() => {
        /* badge is optional chrome; ignore fetch errors */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!label) return null;

  return (
    <Badge variant="secondary" className="max-w-56 truncate" title={`Active scenario: ${label}`}>
      <FlaskConical className="size-3" aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto my-3 mb-6 w-[calc(100vw-24px)] max-w-[1520px]">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5">
            <Image
              src="/adb-logo.png"
              alt="Asian Development Bank"
              width={960}
              height={960}
              priority
              className="h-[34px] w-auto"
            />
            <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-[0.95rem] tracking-[0.01em] text-[var(--color-brand)]">
              Asian Development Bank
            </span>
          </div>
          <span className="hidden font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-ink)] sm:inline">
            RISE-PNG
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ActiveScenarioBadge />
          {/* Phase 5: user menu slot */}
          <div
            aria-hidden
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--color-line)] text-[var(--color-muted)] sm:flex"
            title="Account (available after sign-in ships)"
          >
            <span className="text-xs">–</span>
          </div>
        </div>
      </header>

      <aside
        aria-label="Research prototype status"
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-[rgba(180,35,24,0.28)] bg-[#fff4f2] px-3.5 py-3 text-[0.9rem] leading-[1.45] text-[#5c1d16]"
      >
        <strong className="font-[family-name:var(--font-display)] tracking-[0.01em] text-[var(--color-danger-ink)]">
          Research prototype
        </strong>
        <span className="min-w-0 flex-[1_1_560px]">
          Rankings are exploratory, may change with data or methodology updates, and are not approved as the
          sole basis for investment decisions.
        </span>
        <Link
          href="/methodology-lab"
          className="font-semibold text-[#7a271a] underline underline-offset-[3px]"
        >
          Review methodology
        </Link>
      </aside>

      <nav aria-label="Dashboard sections" className="mb-4 flex flex-wrap gap-2.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-2.5 text-sm transition-colors",
                active
                  ? "border-[rgba(10,46,115,0.26)] bg-[rgba(10,46,115,0.1)] font-semibold text-[var(--color-ink)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[rgba(10,46,115,0.06)] hover:text-[var(--color-ink)]"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section className="grid min-h-[calc(100vh-140px)] gap-4">{children}</section>
    </div>
  );
}
