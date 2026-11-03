/**
 * Whether this server runs with sign-in off, as the page's script can read it. `/screening` is prerendered and the
 * same build runs either way, so the page cannot carry the answer; the proxy, which runs on every request, sets this
 * cookie when sign-in is off and clears it when sign-in is on. With it the page skips asking `/auth/token` and
 * `/auth/user`, so its first reads do not wait a round trip for an answer that is always "not required".
 *
 * It is not a credential: the API decides who may read. A cookie set by hand on a server with sign-in on is cleared
 * by the next page request, and until then the reads go out without a token and are refused.
 */
export const SIGN_IN_OFF_COOKIE = "rise-sign-in";
export const SIGN_IN_OFF_VALUE = "off";

export function signInIsOff(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(/;\s*/).includes(`${SIGN_IN_OFF_COOKIE}=${SIGN_IN_OFF_VALUE}`);
}
