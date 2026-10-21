export type AuthConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function csvValues(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAuthRequired(): boolean {
  return process.env.AUTH_REQUIRED === "true";
}

export function hasLocalAuthBypass(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS_LOCAL === "true";
}

export function shouldEnforceAuth(): boolean {
  return isAuthRequired() && !hasLocalAuthBypass();
}

export function getAuthConfig(): AuthConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
  return supabaseUrl && supabaseAnonKey ? { supabaseUrl, supabaseAnonKey } : null;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;

  const allowedEmails = csvValues(process.env.AUTH_ALLOWED_EMAILS);
  const allowedDomains = csvValues(process.env.AUTH_ALLOWED_EMAIL_DOMAINS);
  const domain = normalized.split("@")[1] ?? "";
  return allowedEmails.has(normalized) || allowedDomains.has(domain);
}

// A backslash (a browser reads `/\evil.com` as `//evil.com`) and the control characters the URL parser strips
// (a tab or line feed turns `/<tab>/evil.com` into `//evil.com`) can all hide a second slash.
const HIDES_A_HOST = /[\\\u0000-\u001f\u007f]/;

/**
 * Where to go after signing in: a path on this origin, or `/`. The value comes from the address, so it must not
 * start a second slash or hold a backslash or control character, written plainly or percent-encoded (checked after
 * each of up to five decodings, which is more than a hop through the sign-in form and the callback makes).
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  let form = value;
  for (let pass = 0; pass < 5; pass += 1) {
    if (!form.startsWith("/") || form.startsWith("//") || HIDES_A_HOST.test(form)) return "/";
    let decoded: string;
    try {
      decoded = decodeURIComponent(form);
    } catch {
      return "/";
    }
    if (decoded === form) break;
    form = decoded;
  }
  return new URL(value, "http://origin.invalid").origin === "http://origin.invalid" ? value : "/";
}
