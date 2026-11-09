import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(readFileSync(".env.declaut-production.local", "utf8"));
const allowed = /^(SITE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY|LICENSE_PRIVATE_KEY_BASE64|LICENSE_KEY_ID|LICENSE_ISSUER|LICENSE_AUDIENCE|GITHUB_RELEASES_REPO|GITHUB_RELEASE_ASSET_NAME|GITHUB_RELEASE_CHANNEL|CONTACT_EMAIL|COMPANY_[A-Z_]+|NEXT_PUBLIC_PRO_[A-Z_]+|STRIPE_[A-Z_]+|BILLING_LIVE_ENABLED)$/;
const entries = Object.entries(env).filter(([name, value]) => allowed.test(name) && value.trim());
const path = ".artifacts/vercel-production.env";
mkdirSync(".artifacts", { recursive: true, mode: 0o700 });
writeFileSync(path, entries.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 }); chmodSync(path, 0o600);
console.log(`Prepared ${path} with ${entries.length} application settings. It contains private server keys; import it only into this project's Vercel Production environment.`);
console.log("Admin CLI tokens, SMTP passwords and retired invoicing settings are excluded. Missing Stripe values are not exported and existing hosted values must be checked separately. No values printed.");
