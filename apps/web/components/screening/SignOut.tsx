"use client";

import { useEffect, useState } from "react";

/**
 * Whether to offer "Sign out": the app asks `/auth/user`, which says whether sign-in is required here and who is
 * signed in. With sign-in off (a contributor's machine, the browser tests) or nobody signed in, there is nothing
 * to sign out of, so the action stays away.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/user", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((user: { required?: boolean; email?: string | null } | null) =>
        setSignedIn(Boolean(user?.required && user.email))
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return signedIn;
}

/**
 * A form that posts to `/auth/sign-out`, which ends the session and answers with a redirect to the sign-in page.
 * A form, not a script, so the browser follows the redirect and Enter and Space work as on any button.
 */
export function SignOut({ label, className }: { label: string; className?: string }) {
  return (
    <form action="/auth/sign-out" method="post" style={{ display: "contents" }}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
