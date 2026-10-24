import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { sessionClient } from "@/lib/server/session";
import { confirmSchema, emailSchema, loginSchema, requestOrigin, resetSchema, signupSchema, siteOrigin, TERMS_VERSION, trustedOrigin } from "@/lib/auth/validation";
import { authMessages } from "@/lib/auth/messages";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const paths: Record<string, string> = { signup: "/signup", login: "/login", "forgot-password": "/forgot-password", "resend-confirmation": "/resend-confirmation", "reset-password": "/reset-password", confirm: "/login", logout: "/account" };

async function bodyData(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (request.headers.get("content-type")?.includes("application/json")) return JSON.parse(bytes.toString("utf8"));
  const response = new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } });
  const form = await response.formData();
  return Object.fromEntries(form.entries());
}

function authError(error: { code?: string; status?: number } | null): string {
  if (error?.status === 429 || ["over_request_rate_limit", "over_email_send_rate_limit"].includes(error?.code ?? "")) return "rate_limited";
  if (error?.code === "email_not_confirmed") return "confirmation_required";
  if (error?.code === "invalid_credentials") return "invalid_credentials";
  if (error?.code === "same_password") return "same_password";
  if (error?.code === "weak_password") return "weak_password";
  return "unavailable";
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!Object.hasOwn(paths, action)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  const baseUrl = requestOrigin(request.url, request.headers.get("host"));
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const respond = (path: string, status?: string, error?: string, fields?: Record<string, string>, httpStatus = 400) => {
    const target = new URL(path, baseUrl);
    if (status) target.searchParams.set("status", status);
    if (error && !wantsJson) target.searchParams.set("error", error);
    if (wantsJson) return NextResponse.json(error ? { error, message: authMessages[error] ?? authMessages.unavailable, fields } : { redirect_to: `${target.pathname}${target.search}` }, { status: error ? httpStatus : 200, headers: noStore });
    return NextResponse.redirect(target, { status: 303, headers: noStore });
  };
  if (!trustedOrigin(baseUrl, request.headers.get("origin"))) return respond(paths[action], undefined, "invalid_request", undefined, 403);
  let input: Record<string, unknown>;
  try { input = await bodyData(request); } catch { return respond(paths[action], undefined, "invalid_request"); }
  const schemas: Record<string, z.ZodType> = { signup: signupSchema, login: loginSchema, "forgot-password": emailSchema, "resend-confirmation": emailSchema, "reset-password": resetSchema, confirm: confirmSchema };
  const validated = action === "logout" ? undefined : schemas[action].safeParse(input);
  if (validated && !validated.success) {
    const fields: Record<string, string> = {};
    validated.error.issues.forEach((issue) => { const name = String(issue.path[0] ?? "form"); fields[name] ??= issue.message; });
    return respond(paths[action], undefined, "invalid_request", fields, 422);
  }
  try {
    const supabase = await sessionClient();
    const origin = siteOrigin(baseUrl, process.env.SITE_URL);
    if (action === "signup") {
      const data = signupSchema.parse(input);
      const result = await supabase.auth.signUp({ email: data.email, password: data.password, options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: { company_name: data.company_name, cui: data.cui, terms_accepted: true, terms_version: TERMS_VERSION },
      } });
      if (result.error) return respond(paths[action], undefined, authError(result.error));
      // This flow requires confirmation; do not silently accept autoconfirmed signups.
      if (result.data.session) { await supabase.auth.signOut({ scope: "local" }); return respond(paths[action], undefined, "signup_unavailable", undefined, 503); }
      return respond("/check-email", "confirmation_sent");
    }
    if (action === "login") {
      const data = loginSchema.parse(input);
      const { data: signedIn, error } = await supabase.auth.signInWithPassword(data);
      if (error) return respond(paths[action], undefined, authError(error), undefined, error.status === 429 ? 429 : 400);
      if (!signedIn.user?.email_confirmed_at || signedIn.user.is_anonymous) {
        await supabase.auth.signOut({ scope: "local" });
        return respond(paths[action], undefined, "confirmation_required");
      }
      return respond("/account");
    }
    if (action === "forgot-password") {
      const { email } = emailSchema.parse(input);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
      // The response must not reveal account existence, including when delivery
      // fails or an address-specific send limit is reached. Log no email values.
      if (error) console.warn("auth.email.request_failed", { action, code: authError(error) });
      return respond("/check-email", "reset_sent");
    }
    if (action === "resend-confirmation") {
      const { email } = emailSchema.parse(input);
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/auth/callback` } });
      if (error) console.warn("auth.email.request_failed", { action, code: authError(error) });
      return respond("/check-email", "confirmation_resent");
    }
    if (action === "confirm") {
      const data = confirmSchema.parse(input);
      const { error } = await supabase.auth.verifyOtp(data);
      if (error) return respond("/login", undefined, "invalid_link");
      return respond(data.type === "recovery" ? "/reset-password" : "/account");
    }
    if (action === "reset-password") {
      const { data: user, error: userError } = await supabase.auth.getUser();
      if (userError || !user.user?.email_confirmed_at || user.user.is_anonymous) return respond(paths[action], undefined, "session_required", undefined, 401);
      const { password } = resetSchema.parse(input);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return respond(paths[action], undefined, authError(error));
      // Ask for a fresh sign-in after changing credentials, on this browser too.
      await supabase.auth.signOut({ scope: "global" });
      return respond("/login", "password_updated");
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return respond("/account", undefined, "unavailable", undefined, 503);
    return respond("/login", "signed_out");
  } catch {
    return respond(paths[action], undefined, "unavailable", undefined, 503);
  }
}
