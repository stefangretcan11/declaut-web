import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { productionConfigIssues } from "../src/lib/production-config";
import { billingReadiness, STRIPE_API_VERSION } from "../src/lib/billing/config";
import { readOblioConfig } from "../src/lib/billing/oblio";
import { validPrice } from "../src/lib/billing/snapshots";
import production from "../docs/track-b-production-config.json";
import { checkDeployment } from "./check-deployment.mjs";
import Stripe from "stripe";

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function add(name: string, ok: boolean, detail?: string) { checks.push({ name, ok, ...(detail ? { detail } : {}) }); }

async function main() {
  const env = process.env;
  const issues = productionConfigIssues(env);
  add("Production application configuration", issues.length === 0, issues.length ? issues.join("; ") : undefined);
  try {
    const key = createPublicKey(createPrivateKey(Buffer.from(env.LICENSE_PRIVATE_KEY_BASE64 ?? "", "base64"))).export({ format: "jwk" });
    add("Production signing key matches the desktop JWK", key.x === production.license.publicKey.x && key.crv === "Ed25519");
  } catch { add("Production signing key matches the desktop JWK", false); }
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_SEMIANNUAL", "STRIPE_PRICE_YEARLY", "STRIPE_PORTAL_CONFIGURATION_ID", "OBLIO_CLIENT_ID", "OBLIO_CLIENT_SECRET", "CRON_SECRET"]) add(name, Boolean(env[name]?.trim()), env[name]?.trim() ? undefined : "missing server configuration");
  try { readOblioConfig(env); add("Oblio supplier, series and explicit VAT setting", true); }
  catch { add("Oblio supplier, series and explicit VAT setting", false); }
  add("Stripe key is live mode", env.STRIPE_SECRET_KEY?.startsWith("sk_live_") === true);
  add("Live checkout enabled after provider acceptance", billingReadiness(env).checkoutReady);

  if (process.argv.includes("--remote")) {
    for (const result of await checkDeployment(production.websiteUrl)) add(`Deployment ${result.method} ${result.path}`, result.ok, result.ok ? undefined : result.reason);
    if (issues.length === 0) {
      try {
        const response = await fetch(`${production.supabaseUrl}/auth/v1/settings`, { redirect: "error", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! }, signal: AbortSignal.timeout(10_000) });
        const settings = await response.json();
        add("Supabase requires confirmed email", response.ok && settings.mailer_autoconfirm === false);
      } catch { add("Supabase requires confirmed email", false); }
      const admin = createClient(production.supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      for (const [table, columns] of Object.entries({ devices: "id,is_active", account_consents: "user_id,version,accepted_at", billing_invoices: "id,fiscal_issue_date,fiscal_retry_after,fiscal_attempts" })) {
        const { error } = await admin.from(table).select(columns).limit(0);
        add(`Production schema ${table}`, !error, error ? "apply the committed migrations" : undefined);
      }
    }
    if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
      try {
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, timeout: 10_000, maxNetworkRetries: 0 });
        const account = await stripe.accounts.retrieve(null);
        add("Stripe account can charge and pay out", account.charges_enabled === true && account.payouts_enabled === true && account.details_submitted === true);
        for (const [interval, name] of [["semiannual", "STRIPE_PRICE_SEMIANNUAL"], ["yearly", "STRIPE_PRICE_YEARLY"]] as const) {
          if (env[name]) { const price = await stripe.prices.retrieve(env[name]); add(`Live Stripe price ${interval}`, price.livemode && validPrice(price, interval)); }
        }
        if (env.STRIPE_PORTAL_CONFIGURATION_ID) {
          const portal = await stripe.billingPortal.configurations.retrieve(env.STRIPE_PORTAL_CONFIGURATION_ID);
          add("Portal permits period-end cancellation and card updates", portal.active && portal.features.subscription_cancel.enabled && portal.features.subscription_cancel.mode === "at_period_end" && portal.features.payment_method_update.enabled && !portal.features.subscription_update.enabled);
        }
        const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
        const webhook = endpoints.data.find((entry) => entry.url === `${production.websiteUrl}/api/stripe/webhook` && entry.status === "enabled" && entry.livemode);
        add("Live Stripe webhook endpoint", Boolean(webhook && webhook.api_version === STRIPE_API_VERSION && ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].every((event) => webhook.enabled_events.includes(event) || webhook.enabled_events.includes("*"))));
      } catch { add("Stripe provider inspection", false, "check server credentials and provider configuration"); }
    }
    try {
      const evidence = JSON.parse(readFileSync(".artifacts/production-license-acceptance.json", "utf8"));
      add("Recent authenticated production license acceptance", evidence.ok === true && evidence.origin === production.apiBaseUrl && Date.now() - Date.parse(evidence.checkedAt) < 86400000);
    } catch { add("Recent authenticated production license acceptance", false, "run test:production after the correct server signing key is deployed"); }
    add("SMTP confirmation/reset inbox acceptance", env.SMTP_ACCEPTANCE_VERIFIED === "true", "record this only after actual confirmation and reset inbox tests");
  }
  mkdirSync(".artifacts", { recursive: true });
  writeFileSync(".artifacts/production-readiness.json", JSON.stringify({ checkedAt: new Date().toISOString(), origin: production.websiteUrl, remote: process.argv.includes("--remote"), ready: checks.every((check) => check.ok), checks }, null, 2) + "\n");
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  console.log("Saved .artifacts/production-readiness.json without secrets. This command creates no accounts, payments or invoices.");
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}
main().catch(() => { console.error("Production inspection failed; provider responses and secrets were not printed."); process.exitCode = 1; });
