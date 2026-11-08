import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import Stripe from "stripe";
import production from "../docs/track-b-production-config.json";
import { PLAN_PRICES, STRIPE_API_VERSION } from "../src/lib/billing/config";
import { validPrice } from "../src/lib/billing/snapshots";

const webhookEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];

export async function configureProductionStripe(stripe: Stripe, origin: string, existingWebhookSecret?: string) {
  const products = await stripe.products.search({ query: "metadata['app']:'declaut' AND metadata['environment']:'production'", limit: 1 });
  const product = products.data[0] ?? await stripe.products.create({ name: "Declaut Pro", metadata: { app: "declaut", environment: "production" } }, { idempotencyKey: "declaut-product:production:v1" });
  const saved: Record<string, string> = {};
  for (const interval of ["semiannual", "yearly"] as const) {
    const expected = PLAN_PRICES[interval];
    const lookup = `declaut-pro-${interval}-ron-v1`;
    const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
    const price = found.data[0] ?? await stripe.prices.create({ product: product.id, lookup_key: lookup, currency: expected.currency, unit_amount: expected.amount, recurring: { interval: expected.interval, interval_count: expected.intervalCount }, metadata: { app: "declaut", environment: "production" } }, { idempotencyKey: `declaut-price:production:${interval}:v1` });
    if (!price.livemode || !validPrice(price, interval) || (typeof price.product === "string" ? price.product : price.product.id) !== product.id) throw new Error("Existing Stripe price does not match the approved Declaut product/price; no price was overwritten");
    saved[interval === "semiannual" ? "STRIPE_PRICE_SEMIANNUAL" : "STRIPE_PRICE_YEARLY"] = price.id;
  }
  const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const portalParams: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Declaut Pro", terms_of_service_url: `${origin}/termeni-si-conditii`, privacy_policy_url: `${origin}/politica-de-confidentialitate` },
    default_return_url: `${origin}/account`, metadata: { app: "declaut", environment: "production" },
    features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" }, subscription_update: { enabled: false } },
  };
  const existingPortal = portals.data.find((entry) => entry.metadata?.app === "declaut" && entry.metadata.environment === "production");
  const portal = existingPortal ? await stripe.billingPortal.configurations.update(existingPortal.id, portalParams) : await stripe.billingPortal.configurations.create(portalParams, { idempotencyKey: "declaut-portal:production:v1" });
  saved.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const url = `${origin}/api/stripe/webhook`;
  const existing = endpoints.data.find((entry) => entry.url === url && entry.livemode && entry.status === "enabled");
  if (existing) {
    if (!existingWebhookSecret) throw new Error("The live webhook already exists; set its existing STRIPE_WEBHOOK_SECRET before completing setup");
    if (existing.api_version !== STRIPE_API_VERSION) throw new Error("The existing live webhook API version must match the application's pinned Stripe version");
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: [...new Set([...existing.enabled_events, ...webhookEvents])] as Stripe.WebhookEndpointCreateParams.EnabledEvent[] });
    saved.STRIPE_WEBHOOK_SECRET = existingWebhookSecret;
  } else {
    const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: webhookEvents, api_version: STRIPE_API_VERSION, metadata: { app: "declaut", environment: "production" } }, { idempotencyKey: "declaut-webhook:production:v1" });
    if (!endpoint.secret) throw new Error("Stripe did not return the newly created webhook secret");
    saved.STRIPE_WEBHOOK_SECRET = endpoint.secret;
  }
  return saved;
}

async function main() {
  console.log(`Stripe production plan for ${production.websiteUrl}: Declaut Pro; RON 300 / 6 months; RON 500 / 12 months; period-end cancellation and card updates; six webhook events.`);
  console.log("No customers, subscriptions, charges or fiscal invoices are created by this setup.");
  if (!process.argv.includes("--apply")) { console.log("Dry run complete; --apply creates/reuses these provider settings and saves returned values privately."); return; }
  if (process.env.LICENSE_ISSUER !== "declaut-production" || process.env.SITE_URL !== production.websiteUrl || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) throw new Error("Production setup requires the matching production origin/issuer and STRIPE_SECRET_KEY in live mode");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 15000 });
  const saved = await configureProductionStripe(stripe, production.websiteUrl, process.env.STRIPE_WEBHOOK_SECRET);
  const path = ".env.declaut-production.local";
  const env = { ...parseEnv(readFileSync(path, "utf8")), ...saved };
  writeFileSync(path, Object.entries(env).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 }); chmodSync(path, 0o600);
  console.log(`Provider settings saved to ${path}. Returned secrets were not printed. Live checkout switches were preserved.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error && !error.message.includes("sk_") && !error.message.includes("whsec_") ? error.message : "Stripe production setup failed; inspect provider settings"); process.exitCode = 1; });
