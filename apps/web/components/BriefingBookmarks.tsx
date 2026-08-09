"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  bookmarkHref,
  bookmarkMatchesState,
  clearUserBriefingBookmarks,
  createBookmarkId,
  loadUserBriefingBookmarks,
  MAP_BOOKMARK_PATHS,
  MAX_BOOKMARK_NAME_LENGTH,
  MAX_USER_BOOKMARKS,
  saveUserBriefingBookmarks,
  SEEDED_BRIEFING_BOOKMARKS,
  type BookmarkPathname,
  type BriefingBookmark,
} from "@/lib/briefingBookmarks";
import type { UrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";

function isBookmarkPathname(value: string): value is BookmarkPathname {
  return MAP_BOOKMARK_PATHS.includes(value as BookmarkPathname);
}

function snapshotState(state: UrlState): UrlState {
  return {
    ...state,
    filters: { ...state.filters, provinces: [...state.filters.provinces] },
    layers: [...state.layers],
    mapView: state.mapView ? { ...state.mapView } : null,
  };
}

export function BriefingBookmarks({
  currentState,
  onApply,
}: {
  currentState: UrlState;
  onApply: (state: UrlState) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userBookmarks, setUserBookmarks] = useState<BriefingBookmark[]>([]);
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setUserBookmarks(loadUserBriefingBookmarks(window.localStorage));
  }, []);

  const bookmarks = useMemo(() => [...SEEDED_BRIEFING_BOOKMARKS, ...userBookmarks], [userBookmarks]);
  const currentIndex = useMemo(() => {
    if (!isBookmarkPathname(pathname)) return -1;
    return bookmarks.findIndex(
      (bookmark) => bookmark.pathname === pathname && bookmarkMatchesState(bookmark, currentState)
    );
  }, [bookmarks, currentState, pathname]);

  const applyBookmark = (bookmark: BriefingBookmark) => {
    if (bookmark.pathname === pathname) {
      onApply(snapshotState(bookmark.state));
      setFeedback(`Opened ${bookmark.name}.`);
      return;
    }
    router.push(bookmarkHref(bookmark.pathname, bookmark.state), { scroll: false });
  };

  const saveBookmarks = (nextBookmarks: BriefingBookmark[], successMessage: string) => {
    try {
      saveUserBriefingBookmarks(window.localStorage, nextBookmarks);
      setUserBookmarks(nextBookmarks);
      setFeedback(successMessage);
    } catch {
      setFeedback("Bookmarks could not be saved in this browser.");
    }
  };

  const addCurrentBookmark = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const bookmarkName = name.trim().replaceAll(/\s+/g, " ");
    if (!bookmarkName) {
      setFeedback("Enter a name for this briefing stop.");
      return;
    }
    if (bookmarkName.length > MAX_BOOKMARK_NAME_LENGTH) {
      setFeedback(`Bookmark names can be up to ${MAX_BOOKMARK_NAME_LENGTH} characters.`);
      return;
    }
    if (userBookmarks.length >= MAX_USER_BOOKMARKS) {
      setFeedback(`You can save up to ${MAX_USER_BOOKMARKS} custom briefing stops.`);
      return;
    }
    if (!isBookmarkPathname(pathname)) {
      setFeedback("Bookmarks are available on the three map pages.");
      return;
    }

    const bookmark: BriefingBookmark = {
      id: createBookmarkId(),
      name: bookmarkName,
      pathname,
      state: snapshotState(currentState),
      kind: "user",
    };
    saveBookmarks([...userBookmarks, bookmark], `Saved ${bookmarkName}.`);
    setName("");
  };

  const removeBookmark = (bookmark: BriefingBookmark) => {
    const nextBookmarks = userBookmarks.filter((item) => item.id !== bookmark.id);
    saveBookmarks(nextBookmarks, `Removed ${bookmark.name}.`);
  };

  const clearBookmarks = () => {
    try {
      clearUserBriefingBookmarks(window.localStorage);
      setUserBookmarks([]);
      setFeedback("Cleared custom briefing stops. Seeded stops remain available.");
    } catch {
      setFeedback("Bookmarks could not be cleared in this browser.");
    }
  };

  const previousBookmark = bookmarks[(currentIndex <= 0 ? bookmarks.length : currentIndex) - 1];
  const nextBookmark = bookmarks[(currentIndex + 1) % bookmarks.length];

  return (
    <section className="border-t border-[var(--color-line)] pt-3" aria-labelledby="briefing-stops-heading">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="briefing-stops-heading" className="text-xs font-semibold text-[var(--color-ink)]">
            Briefing stops
          </h2>
          <p className="mt-0.5 text-[0.7rem] text-[var(--color-muted)]">Save and replay this map view.</p>
        </div>
        <div className="flex gap-1" aria-label="Browse briefing stops">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => applyBookmark(previousBookmark)}
            aria-label="Previous briefing stop"
            title="Previous briefing stop"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => applyBookmark(nextBookmark)}
            aria-label="Next briefing stop"
            title="Next briefing stop"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <nav className="mt-2 grid gap-1" aria-label="Briefing stops">
        {bookmarks.map((bookmark) => {
          const isCurrent = currentIndex >= 0 && bookmarks[currentIndex]?.id === bookmark.id;
          return (
            <div key={bookmark.id} className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant={isCurrent ? "secondary" : "ghost"}
                size="sm"
                className={cn("min-w-0 flex-1 justify-start truncate", isCurrent && "font-semibold")}
                onClick={() => applyBookmark(bookmark)}
                aria-current={isCurrent ? "true" : undefined}
              >
                <span className="truncate">{bookmark.name}</span>
              </Button>
              {bookmark.kind === "user" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeBookmark(bookmark)}
                  aria-label={`Remove ${bookmark.name}`}
                  title={`Remove ${bookmark.name}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </div>
          );
        })}
      </nav>

      <form className="mt-3 flex gap-1" onSubmit={addCurrentBookmark}>
        <label className="sr-only" htmlFor="briefing-bookmark-name">
          Name this briefing stop
        </label>
        <input
          id="briefing-bookmark-name"
          value={name}
          maxLength={MAX_BOOKMARK_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name current view"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-2)]"
        />
        <Button type="submit" size="sm" className="shrink-0">
          <Plus aria-hidden />
          Save
        </Button>
      </form>
      {userBookmarks.length ? (
        <Button type="button" variant="link" size="sm" className="mt-1 px-0" onClick={clearBookmarks}>
          Clear custom stops
        </Button>
      ) : null}
      <p className="mt-2 text-xs text-[var(--color-muted)]" role="status" aria-live="polite">
        {feedback ?? `${bookmarks.length} briefing stops available.`}
      </p>
    </section>
  );
}
