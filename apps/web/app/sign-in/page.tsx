import { getAuthConfig, isAuthRequired, safeNextPath } from "@/lib/auth";
import { LAYOUT } from "@/lib/screening/copy/words";
import { sendMagicLink } from "@/app/sign-in/actions";

import styles from "./sign-in.module.css";

// The words the copy system has are its own: the product's name, its line and the logo's label. The rest of this
// page's words are written here until the copy system takes them.
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
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <div className={styles.brand}>
          <svg className={styles.logo} viewBox="0 0 108 108" role="img" aria-label={LAYOUT.logoAria}>
            <rect width="108" height="108" fill="#0a2e73" />
            <text x="54" y="68" fill="#fff" fontSize="48" textAnchor="middle">
              ADB
            </text>
          </svg>
          <p className={styles.name}>{LAYOUT.productName}</p>
          <p className={styles.sub}>{LAYOUT.productSub}</p>
        </div>
        <h1 id="sign-in-title" className={styles.title}>
          Sign in to the decision workspace
        </h1>
        <p className={styles.lead}>
          Use an approved work email. We will send a one-time secure sign-in link.
        </p>
        {sent ? (
          <p className={`${styles.note} ${styles.sent}`} role="status">
            Check your inbox and open the sign-in link on this device.
          </p>
        ) : null}
        {error ? (
          <p className={`${styles.note} ${styles.error}`} role="alert">
            {error}
          </p>
        ) : null}
        <form action={sendMagicLink} className={styles.form}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required disabled={!configured} />
          <button type="submit" disabled={!configured}>
            Email me a sign-in link
          </button>
        </form>
        {!configured ? (
          <p className={styles.hint}>Access remains unavailable until auth is configured.</p>
        ) : null}
      </section>
    </main>
  );
}
