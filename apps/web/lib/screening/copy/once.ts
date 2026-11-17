/**
 * Runs `load` once and shares its promise between callers. A load that fails is forgotten, so the next call tries
 * again, and the caller that asked sees the failure. A chunk that fails to download is the case: the next try can
 * succeed, so a rejection must not be kept for the life of the page.
 */
export function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) {
      const attempt: Promise<T> = load().catch((error: unknown) => {
        if (pending === attempt) pending = undefined;
        throw error;
      });
      pending = attempt;
    }
    return pending;
  };
}
