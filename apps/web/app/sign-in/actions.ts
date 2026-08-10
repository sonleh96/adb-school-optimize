"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthConfig, isAllowedEmail, safeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!isAllowedEmail(email)) redirect(`/sign-in?error=allowlist&next=${encodeURIComponent(next)}`);

  const config = getAuthConfig();
  const supabase = await createSupabaseServerClient();
  if (!config || !supabase) redirect(`/sign-in?error=configuration&next=${encodeURIComponent(next)}`);

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const siteUrl = process.env.AUTH_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : null);
  if (!siteUrl) redirect(`/sign-in?error=configuration&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`/sign-in?error=delivery&next=${encodeURIComponent(next)}`);
  redirect(`/sign-in?sent=1&next=${encodeURIComponent(next)}`);
}
