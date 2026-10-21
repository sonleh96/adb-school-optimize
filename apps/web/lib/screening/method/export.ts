"use client";

/**
 * The top list file, read from the API (`/exports/top.csv`), which writes the method record into it. The export sheet
 * previews what it read and downloads the same text, so the file on disk is the one previewed.
 */
import { useQuery } from "@tanstack/react-query";

import { apiFetchFile } from "@/lib/api";

import { screeningUrl } from "../api";
import { classifyFailure } from "../errors";
import type { RuleId } from "../types";
import { type TopCsv, parseTopCsv } from "./top-csv";
import { type TopList, fileNameOf, topListOf } from "./top-list";

export interface TopListFile {
  readonly text: string;
  /** The file name the API gave, or null. */
  readonly name: string | null;
  readonly type: string;
  readonly file: TopCsv;
  readonly list: TopList;
}

/**
 * The top list of `rule` at length `k`. `province` cuts it as the screen's filter does; the API names the filter in
 * the file's own record. The API has no remoteness filter, so the sheet says when one is on screen and not in the file.
 */
export async function fetchTopList(
  rule: RuleId,
  k: number,
  province: string | null,
  signal?: AbortSignal
): Promise<TopListFile> {
  const url = screeningUrl("/exports/top.csv", { rule, k: String(k), province: province ?? undefined });
  const read = await apiFetchFile(url, { signal });
  const file = parseTopCsv(read.text);
  return {
    text: read.text,
    name: fileNameOf(read.disposition),
    type: read.type ?? "text/csv; charset=utf-8",
    file,
    list: topListOf(file),
  };
}

/** The top list of `rule` at length `k`, cut to `province` when one is set, or nothing while `enabled` is false. */
export function useTopList(rule: RuleId | null, k: number, province: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["screening", "export", "top", rule, k, province],
    queryFn: ({ signal }) => fetchTopList(rule as RuleId, k, province, signal),
    enabled: enabled && rule !== null,
    retry: (failures, error) => failures < 1 && ["server", "network"].includes(classifyFailure(error)),
    // A file carries the time it was made, so an open sheet keeps the file it showed.
    staleTime: Infinity,
  });
}

/** Saves `text` as a file in the browser's downloads. */
export function saveFile(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The method record as lines of text, as the file states it, for the clipboard. */
export const recordText = (file: TopCsv): string =>
  file.record.map((line) => `${line.key}: ${line.value}`).join("\n");
