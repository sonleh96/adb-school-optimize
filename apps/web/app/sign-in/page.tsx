import { getAuthConfig, isAuthRequired, safeNextPath } from "@/lib/auth";
import { SIGN_IN } from "@/lib/screening/copy/sign-in";
import { LAYOUT } from "@/lib/screening/copy/words";
import { sendMagicLink } from "@/app/sign-in/actions";

import styles from "./sign-in.module.css";

// Every word on this page comes from the copy system: the product's name, its line and the logo's label are
// `LAYOUT`'s, and the rest are `SIGN_IN`'s.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error =
    typeof params.error === "string" && Object.hasOwn(SIGN_IN.errors, params.error)
      ? SIGN_IN.errors[params.error as keyof typeof SIGN_IN.errors]
      : null;
  const sent = params.sent === "1";
  const configured = Boolean(getAuthConfig()) && isAuthRequired();

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <div className={styles.brand}>
          <svg className={styles.logo} viewBox="0 0 108 108" role="img" aria-label={LAYOUT.logoAria}>
            <rect width="108" height="108" fill="#0a2e73" />
            <text x="54" y="68" fill="#fff" fontSize="48" textAnchor="middle">
              {LAYOUT.logoMark}
            </text>
          </svg>
          <p className={styles.name}>{LAYOUT.productName}</p>
          <p className={styles.sub}>{LAYOUT.productSub}</p>
        </div>
        <h1 id="sign-in-title" className={styles.title}>
          {SIGN_IN.title}
        </h1>
        <p className={styles.lead}>{SIGN_IN.lead}</p>
        {sent ? (
          <p className={`${styles.note} ${styles.sent}`} role="status">
            {SIGN_IN.sent}
          </p>
        ) : null}
        {error ? (
          <p className={`${styles.note} ${styles.error}`} role="alert">
            {error}
          </p>
        ) : null}
        <form action={sendMagicLink} className={styles.form}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">{SIGN_IN.emailLabel}</label>
          <input id="email" name="email" type="email" autoComplete="email" required disabled={!configured} />
          <button type="submit" disabled={!configured}>
            {SIGN_IN.button}
          </button>
        </form>
        {!configured ? <p className={styles.hint}>{SIGN_IN.unavailable}</p> : null}
      </section>
    </main>
  );
}
