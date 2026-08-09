"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--color-surface-strong)] group-[.toaster]:text-[var(--color-ink)] group-[.toaster]:border-[var(--color-line)] group-[.toaster]:shadow-[var(--shadow-pop)]",
          description: "group-[.toast]:text-[var(--color-muted)]",
          actionButton:
            "group-[.toast]:bg-[var(--color-brand)] group-[.toast]:text-[var(--color-brand-foreground)]",
          cancelButton:
            "group-[.toast]:bg-[var(--color-surface-muted)] group-[.toast]:text-[var(--color-muted)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
