"use client";

import { useState } from "react";

import { buildShareableUrl, type UrlState } from "@/lib/urlState";

export function CopyLinkButton({ state }: { state: UrlState }) {
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildShareableUrl(state));
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  };

  return (
    <div>
      <button type="button" className="score-toggle-button" onClick={copyLink}>
        Copy link
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {feedback === "copied"
          ? "Shareable link copied."
          : feedback === "failed"
            ? "Could not copy the link."
            : ""}
      </p>
      {feedback === "failed" ? <p className="overlay-copy">Could not copy the link.</p> : null}
    </div>
  );
}
