import Image from "next/image";

import { getAuthConfig, isAuthRequired, safeNextPath } from "@/lib/auth";
import { sendMagicLink } from "@/app/sign-in/actions";

const ERROR_COPY: Record<string, string> = {
  allowlist: "This email is not on the approved access list.",
  callback: "The sign-in link is invalid or expired. Request a new link.",
  configuration: "Authentication is not configured for this deployment.",
  delivery: "The sign-in email could not be sent. Try again shortly.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? ERROR_COPY[params.error] : null;
  const sent = params.sent === "1";
  const configured = Boolean(getAuthConfig()) && isAuthRequired();

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Image src="/adb-logo.png" alt="Asian Development Bank" width={960} height={960} priority />
        <p className="auth-eyebrow">RISE-PNG</p>
        <h1 id="sign-in-title">Sign in to the decision workspace</h1>
        <p>Use an approved work email. We will send a one-time secure sign-in link.</p>
        {sent ? (
          <p className="auth-message" role="status">
            Check your inbox and open the sign-in link on this device.
          </p>
        ) : null}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <form action={sendMagicLink} className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required disabled={!configured} />
          <button className="button button-primary" type="submit" disabled={!configured}>
            Email me a sign-in link
          </button>
        </form>
        {!configured ? (
          <p className="small-copy">Access remains unavailable until auth is configured.</p>
        ) : null}
      </section>
    </main>
  );
}
