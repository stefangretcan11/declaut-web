import production from "../../docs/track-b-production-config.json";

type Env = Record<string, string | undefined>;
export function isProductionProject(env: Env = process.env) {
  return env.NEXT_PUBLIC_SUPABASE_URL === production.supabaseUrl;
}
export function productionSupabaseMatches(env: Env = process.env) {
  return env.NEXT_PUBLIC_SUPABASE_URL === production.supabaseUrl && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === production.supabasePublishableKey && env.SITE_URL === production.websiteUrl;
}
export function productionSiteMatches(env: Env = process.env) {
  return env.LICENSE_ISSUER === production.license.issuer && env.SITE_URL === production.websiteUrl;
}
export function productionConfigIssues(env: Env = process.env): string[] {
  const issues: string[] = [];
  const expected: Record<string, string | null> = {
    SITE_URL: production.websiteUrl, NEXT_PUBLIC_SUPABASE_URL: production.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: production.supabasePublishableKey,
    LICENSE_ISSUER: production.license.issuer, LICENSE_AUDIENCE: production.license.audience,
    LICENSE_KEY_ID: production.license.publicKey.kid,
  };
  for (const [name, value] of Object.entries(expected)) if (!value || env[name]?.trim() !== value) issues.push(`${name}: does not match the production handoff`);
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "LICENSE_PRIVATE_KEY_BASE64", "COMPANY_LEGAL_NAME", "COMPANY_CUI", "COMPANY_ADDRESS", "CONTACT_EMAIL"]) {
    if (!env[name]?.trim()) issues.push(`${name}: missing`);
  }
  if (env.CONTACT_EMAIL && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.CONTACT_EMAIL)) issues.push("CONTACT_EMAIL: invalid");
  if (env.GITHUB_RELEASE_CHANNEL !== "stable") issues.push("GITHUB_RELEASE_CHANNEL: production requires stable releases");
  for (const [name, amount] of [["NEXT_PUBLIC_PRO_SEMIANNUAL_PRICE_RON", 300], ["NEXT_PUBLIC_PRO_YEARLY_PRICE_RON", 500]] as const) if (env[name] && Number(env[name]) !== amount) issues.push(`${name}: does not match the approved checkout amount`);
  return issues;
}
