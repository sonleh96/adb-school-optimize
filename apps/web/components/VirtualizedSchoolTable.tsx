"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";

import { scoreToPillStyle } from "@/lib/color";
import type { SchoolRecord } from "@/lib/types";

const ROW_HEIGHT = 40;

export function VirtualizedSchoolTable({
  schools,
  selectedSchoolId,
  onSelectSchool,
}: {
  schools: SchoolRecord[];
  selectedSchoolId: string | null;
  onSelectSchool: (schoolId: string | null) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: schools.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });
  const selectedSchoolIndex = useMemo(
    () => (selectedSchoolId ? schools.findIndex((school) => school.school_id === selectedSchoolId) : -1),
    [schools, selectedSchoolId]
  );

  useEffect(() => {
    if (selectedSchoolIndex < 0) return;
    virtualizer.scrollToIndex(selectedSchoolIndex, { align: "auto" });
  }, [selectedSchoolIndex, virtualizer]);

  return (
    <div className="table-wrap" style={{ border: 0, borderRadius: 0, height: "100%" }}>
      <div ref={parentRef} className="virtual-table-scroll">
        <table className="data-table virtual-data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>School</th>
              <th>Pri</th>
              <th>Need</th>
            </tr>
          </thead>
        </table>
        <div
          className="virtual-table-body"
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const school = schools[virtualRow.index];
            if (!school) return null;
            const key = school.school_id ?? `${school.school_name}-${school.latitude}-${school.longitude}`;
            return (
              <div
                key={key}
                className="virtual-table-row data-row"
                data-selected={school.school_id === selectedSchoolId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onSelectSchool(school.school_id ?? null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectSchool(school.school_id ?? null);
                  }
                }}
                role="button"
                aria-pressed={school.school_id === selectedSchoolId}
                tabIndex={0}
              >
                <span className="virtual-cell virtual-cell-rank">{school.rank_priority ?? "n/a"}</span>
                <span className="virtual-cell virtual-cell-name school-name-cell">{school.school_name}</span>
                <span className="virtual-cell virtual-cell-score">
                  <span className="score-pill" style={scoreToPillStyle(school.priority)}>
                    {school.priority != null ? (school.priority * 100).toFixed(1) : "n/a"}
                  </span>
                </span>
                <span className="virtual-cell virtual-cell-score">
                  <span className="score-pill" style={scoreToPillStyle(school.need)}>
                    {school.need != null ? (school.need * 100).toFixed(1) : "n/a"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
