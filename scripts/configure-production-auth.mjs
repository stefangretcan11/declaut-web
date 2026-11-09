import { readFileSync } from "node:fs";
import { productionAuthConfig } from "./production-auth-config.mjs";

async function main() {
  const config = JSON.parse(readFileSync("docs/track-b-production-config.json", "utf8"));
  if (process.env.LICENSE_ISSUER !== config.license.issuer || process.env.NEXT_PUBLIC_SUPABASE_URL !== config.supabaseUrl || process.env.SITE_URL !== config.websiteUrl) throw new Error("Production auth target does not match the public handoff");
  const project = new URL(config.supabaseUrl).hostname.split(".")[0];
  if (!/^[a-z]{20}$/.test(project)) throw new Error("Invalid Supabase project ref");
  const args = process.argv.slice(2);
  let smtp;
  if (args.includes("--smtp")) {
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"];
    if (required.some((name) => !process.env[name])) throw new Error(`SMTP setup requires ${required.join(", ")}`);
    smtp = { smtp_host: process.env.SMTP_HOST, smtp_port: process.env.SMTP_PORT, smtp_user: process.env.SMTP_USER, smtp_pass: process.env.SMTP_PASSWORD, smtp_admin_email: process.env.SMTP_FROM_EMAIL, smtp_sender_name: "Declaut" };
  }
  const patch = productionAuthConfig(config.websiteUrl, {
    ...(args.includes("--settings-only") ? {} : { confirmation: readFileSync("supabase/templates/production-confirmation.html", "utf8"), recovery: readFileSync("supabase/templates/production-recovery.html", "utf8") }), smtp,
  });
  console.log(`Production auth plan for ${project}: canonical URL, exact production redirects, 12-character passwords, confirmation required${smtp ? ", SMTP configuration" : ", existing SMTP preserved"}.`);
  console.log(`Patch fields: ${Object.keys(patch).join(", ")}. No setting values or secrets printed.`);
  if (!args.includes("--apply")) { console.log("Dry run complete; use --apply to update these exact fields."); return; }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required to apply production auth settings; the service-role key is not a Management API token");
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, { method: "PATCH", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  if (!response.ok) throw new Error(`Production auth update failed (HTTP ${response.status}); inspect Supabase settings`);
  console.log("Production auth settings applied. Actual confirmation/reset email delivery still requires an inbox test.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Production auth setup failed"); process.exitCode = 1; });
