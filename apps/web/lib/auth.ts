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

export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/all-schools";
}
