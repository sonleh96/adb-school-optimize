"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-[18px] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)] p-6",
        className
      )}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function EmptyState({
  title = "Nothing to show yet",
  message,
  action,
  className,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-[var(--color-line)] bg-[var(--color-surface-muted)] px-6 py-10 text-center",
        className
      )}
    >
      <Inbox className="size-8 text-[var(--color-muted)]" aria-hidden />
      <p className="m-0 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-ink)]">
        {title}
      </p>
      {message ? <p className="m-0 max-w-prose text-sm text-[var(--color-muted)]">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message = "The data could not be loaded. Try again.",
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-[18px] border border-[rgba(180,35,24,0.28)] bg-[#fff4f2] px-6 py-10 text-center",
        className
      )}
    >
      <AlertTriangle className="size-8 text-[var(--color-danger)]" aria-hidden />
      <p className="m-0 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-danger-ink)]">
        {title}
      </p>
      <p className="m-0 max-w-prose text-sm text-[#5c1d16]">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
