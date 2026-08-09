"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildBriefingFootnote,
  buildSchoolsCsv,
  createStoreZip,
  downloadBlob,
  exportFilename,
} from "@/lib/exportPack";
import type { SchoolFilters } from "@/lib/schoolFilters";
import type { SchoolRecord } from "@/lib/types";

export function ExportBriefingPackButton({
  captureMap,
  schools,
  scoreField,
  filters,
  scenarioId,
  scenarioName,
  selectedSchool,
  getActiveBookmarkName,
}: {
  captureMap: (() => Promise<Blob>) | null;
  schools: readonly SchoolRecord[];
  scoreField: "priority" | "need";
  filters: SchoolFilters;
  scenarioId: string | null;
  scenarioName: string | null;
  selectedSchool: SchoolRecord | null;
  getActiveBookmarkName: () => string | null;
}) {
  const [status, setStatus] = useState<"idle" | "exporting" | "complete" | "error">("idle");
  const inFlight = useRef(false);

  const exportPack = async () => {
    if (!captureMap || inFlight.current) return;
    inFlight.current = true;
    setStatus("exporting");
    const generatedAt = new Date();
    try {
      const mapPng = await captureMap();
      const methodologyUrl = `${window.location.origin}/methodology-lab`;
      const zip = await createStoreZip(
        [
          { name: "map.png", data: mapPng },
          { name: "schools.csv", data: buildSchoolsCsv(schools) },
          {
            name: "briefing-footnote.txt",
            data: buildBriefingFootnote({
              generatedAt,
              scenarioId,
              scenarioName,
              scoreField,
              filters,
              selectedSchool,
              activeBookmarkName: getActiveBookmarkName(),
              methodologyUrl,
            }),
          },
        ],
        generatedAt
      );
      downloadBlob(zip, exportFilename("rise-png-briefing-pack", generatedAt, "zip"));
      setStatus("complete");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  };

  const unavailable = !captureMap;
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full justify-start"
        onClick={() => void exportPack()}
        disabled={unavailable || status === "exporting"}
        aria-describedby="briefing-pack-status"
      >
        <Download aria-hidden />
        {status === "exporting" ? "Preparing briefing pack…" : "Export briefing pack"}
      </Button>
      <p
        id="briefing-pack-status"
        className="mt-1 text-xs text-[var(--color-muted)]"
        role="status"
        aria-live="polite"
      >
        {unavailable
          ? "Map export is preparing."
          : status === "complete"
            ? "Briefing pack downloaded."
            : status === "error"
              ? "Briefing pack could not be created. Try again."
              : "Includes the current map, filtered schools CSV, and methodology footnote."}
      </p>
    </div>
  );
}
