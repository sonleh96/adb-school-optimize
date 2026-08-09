"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FlaskConical, Globe2, Layers3, MapPinned, BookOpenText, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { useScenariosQuery } from "@/lib/hooks";
import { SELECTED_SCENARIO_STORAGE_KEY } from "@/lib/scenarioSelection";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/all-schools", label: "Overview", icon: Globe2 },
  { href: "/school-explorer", label: "Schools", icon: MapPinned },
  { href: "/district-explorer", label: "Districts", icon: Layers3 },
  { href: "/scenario-lab", label: "Scenarios", icon: SlidersHorizontal },
  { href: "/methodology-lab", label: "Method", icon: BookOpenText },
];

function ActiveScenarioBadge() {
  const { data: scenarios } = useScenariosQuery();
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  useEffect(() => {
    setScenarioId(window.localStorage.getItem(SELECTED_SCENARIO_STORAGE_KEY));
  }, []);

  const label = useMemo(() => {
    if (!scenarioId || !scenarios) return null;
    return scenarios.find((scenario) => scenario.scenario_id === scenarioId)?.scenario_name ?? null;
  }, [scenarioId, scenarios]);

  if (!label) return null;

  return (
    <span
      className="hidden max-w-36 items-center gap-1 truncate rounded-md bg-[rgba(10,46,115,0.08)] px-2 py-1 text-[11px] font-medium text-[var(--color-brand)] sm:inline-flex"
      title={`Active scenario: ${label}`}
    >
      <FlaskConical className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#e8ecf1] text-[var(--color-ink)]">
      <header className="z-50 flex h-11 shrink-0 items-center gap-2 border-b border-[rgba(15,31,51,0.08)] bg-white/90 px-2.5 shadow-[0_1px_0_rgba(15,31,51,0.04)] backdrop-blur-xl sm:px-3">
        <Link href="/all-schools" className="flex shrink-0 items-center gap-1.5 pr-1">
          <Image
            src="/adb-logo.png"
            alt="Asian Development Bank"
            width={960}
            height={960}
            priority
            className="h-6 w-auto"
          />
          <span className="font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-tight text-[var(--color-brand)]">
            RISE-PNG
          </span>
        </Link>

        <div className="mx-1 hidden h-5 w-px bg-[rgba(15,31,51,0.1)] sm:block" aria-hidden />

        <nav
          aria-label="Dashboard sections"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                  active
                    ? "bg-[var(--color-brand)] font-semibold text-white shadow-sm"
                    : "text-[var(--color-muted)] hover:bg-[rgba(15,31,51,0.05)] hover:text-[var(--color-ink)]"
                )}
              >
                <Icon className="size-3.5 opacity-90" aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <ActiveScenarioBadge />
          <Link
            href="/methodology-lab"
            className="rounded-md border border-[rgba(180,35,24,0.22)] bg-[#fff5f3] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--color-danger-ink)]"
            title="Research prototype — rankings are exploratory"
          >
            Research
          </Link>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 bg-[#d9e0ea]">{children}</main>
    </div>
  );
}
