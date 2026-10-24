import { z } from "zod";

export const TERMS_VERSION = "2026-10-24-staging";
export const passwordSchema = z.string().min(12, "Folosește cel puțin 12 caractere.").max(128, "Folosește cel mult 128 de caractere.");
const email = z.email("Introdu o adresă de email validă.").max(254).transform((value) => value.toLowerCase());
const emailField = z.string().trim().pipe(email);

export const signupSchema = z.object({
  email: emailField,
  password: passwordSchema,
  company_name: z.string().trim().min(2, "Introdu numele companiei.").max(160, "Folosește cel mult 160 de caractere.").regex(/^[^\u0000-\u001f\u007f]+$/, "Numele conține caractere nepermise."),
  cui: z.string().trim().transform((value) => value.replace(/\s/g, "").toUpperCase()).pipe(z.string().regex(/^(RO)?[0-9]{2,10}$/, "Introdu CUI-ul, cu sau fără prefixul RO.")),
  terms: z.preprocess((value) => value === "on" || value === true, z.literal(true, { error: "Acceptă termenii pentru a crea contul." })),
});

export const loginSchema = z.object({ email: emailField, password: z.string().min(1, "Introdu parola.").max(256) });
export const emailSchema = z.object({ email: emailField });
export const resetSchema = z.object({ password: passwordSchema, confirm_password: z.string() })
  .refine((data) => data.password === data.confirm_password, { path: ["confirm_password"], message: "Parolele nu coincid." });
export const confirmSchema = z.object({
  token_hash: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["email", "signup", "recovery"]),
});

export function safeAuthDestination(value: string | null | undefined): "/account" | "/reset-password" {
  return value === "/reset-password" ? "/reset-password" : "/account";
}

export function trustedOrigin(requestUrl: string, originHeader: string | null): boolean {
  if (!originHeader) return false;
  try { return new URL(originHeader).origin === new URL(requestUrl).origin && new URL(originHeader).pathname === "/"; }
  catch { return false; }
}

export function requestOrigin(requestUrl: string, hostHeader: string | null): string {
  const url = new URL(requestUrl);
  if (hostHeader) {
    // Next.js normalizes loopback hostnames to localhost in request.url. Use the
    // actual Host for browser Origin checks; do not trust forwarded host headers.
    const host = new URL(`${url.protocol}//${hostHeader}`);
    if (host.username || host.password || host.pathname !== "/" || host.search || host.hash) throw new Error("Invalid request host");
    url.host = host.host;
  }
  return url.origin;
}

export function siteOrigin(requestUrl: string, configured?: string): string {
  const url = new URL(configured || requestUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("SITE_URL must be an HTTPS origin or local development URL");
  }
  if (url.username || url.password || (configured && (url.pathname !== "/" || url.search || url.hash))) throw new Error("SITE_URL must contain only the site origin");
  return url.origin;
}
