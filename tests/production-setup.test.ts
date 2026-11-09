import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { configureProductionStripe } from "../scripts/configure-production-stripe";
import { productionAuthConfig } from "../scripts/production-auth-config.mjs";
import { productionConfigIssues, productionSiteMatches, productionSupabaseMatches } from "../src/lib/production-config";
import production from "../docs/track-b-production-config.json";

test("Production URL checks accept equivalent root URLs and reject missing schemes, different origins and embedded paths", () => {
  const env = {
    SITE_URL: production.websiteUrl, NEXT_PUBLIC_SUPABASE_URL: production.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: production.supabasePublishableKey,
    LICENSE_ISSUER: production.license.issuer, LICENSE_AUDIENCE: production.license.audience,
    LICENSE_KEY_ID: production.license.publicKey.kid, LICENSE_PRIVATE_KEY_BASE64: "fixture",
    SUPABASE_SERVICE_ROLE_KEY: "fixture", COMPANY_LEGAL_NAME: "Operator", COMPANY_CUI: "26143268",
    COMPANY_ADDRESS: "Craiova", CONTACT_EMAIL: "owner@example.test", GITHUB_RELEASE_CHANNEL: "stable",
    VERCEL_ENV: "preview",
  };
  for (const SITE_URL of [production.websiteUrl, `${production.websiteUrl}/`, ` ${production.websiteUrl}/ `, "https://WWW.DECLAUT.RO:443/"]) {
    const configured = { ...env, SITE_URL };
    assert.deepEqual(productionConfigIssues(configured), []);
    assert.equal(productionSupabaseMatches(configured), true);
    assert.equal(productionSiteMatches(configured), true);
  }
  for (const SITE_URL of [undefined, "", "www.declaut.ro", "https://declaut.ro", "http://www.declaut.ro", "https://www.declaut.ro:8443", `${production.websiteUrl}/account`, `${production.websiteUrl}/?next=1`, `${production.websiteUrl}/#account`, "https://user:pass@www.declaut.ro", `"${production.websiteUrl}"`, `SITE_URL=${production.websiteUrl}`]) {
    const configured = { ...env, SITE_URL };
    assert.equal(productionSupabaseMatches(configured), false);
    assert.equal(productionSiteMatches(configured), false);
    assert.deepEqual(productionConfigIssues(configured), [`SITE_URL: set it to ${production.websiteUrl} for Vercel preview, including https://; save and redeploy`]);
  }
});

test("Production auth configuration preserves SMTP by default and permits only the exact production callback URLs", () => {
  const config = productionAuthConfig("https://www.declaut.ro", {});
  assert.equal(config.site_url, "https://www.declaut.ro");
  assert.equal(config.mailer_autoconfirm, false);
  assert.equal(config.password_min_length, 12);
  assert.equal(Object.keys(config).some((key) => key.startsWith("smtp_")), false);
  assert.equal(config.uri_allow_list.includes("localhost"), false);
  assert.equal(config.uri_allow_list.includes("*"), false);
  assert.equal(config.uri_allow_list.split(",").length, 3);
  for (const origin of ["http://declaut.example", "https://user:pass@declaut.example", "https://declaut.example/callback"]) assert.throws(() => productionAuthConfig(origin));
});

test("Stripe production setup reuses its product, exact prices, dedicated cancellation portal and webhook across repeated runs", async () => {
  let product: any; const prices: any[] = []; const portals: any[] = []; const endpoints: any[] = [];
  let productCreates = 0; let portalCreates = 0; let webhookCreates = 0;
  const fake = {
    products: { search: async () => ({ data: product ? [product] : [] }), create: async (params: any) => { productCreates++; product = { ...params, id: "prod_declaut" }; return product; } },
    prices: { list: async (params: any) => ({ data: prices.filter((price) => params.lookup_keys.includes(price.lookup_key)) }), create: async (params: any) => { const price = { ...params, id: `price_${prices.length + 1}`, active: true, livemode: true }; prices.push(price); return price; } },
    billingPortal: { configurations: { list: async () => ({ data: portals }), create: async (params: any) => { portalCreates++; const value = { ...params, id: "bpc_declaut" }; portals.push(value); return value; }, update: async (id: string, params: any) => { assert.equal(id, "bpc_declaut"); return { ...params, id }; } } },
    webhookEndpoints: { list: async () => ({ data: endpoints }), create: async (params: any) => { webhookCreates++; const endpoint = { ...params, id: "we_declaut", secret: "whsec_fixture", status: "enabled", livemode: true }; endpoints.push(endpoint); return endpoint; }, update: async (id: string, params: any) => { assert.equal(id, "we_declaut"); assert.equal(params.enabled_events.length, 6); return { id }; } },
  } as unknown as Stripe;
  const first = await configureProductionStripe(fake, "https://www.declaut.ro");
  assert.equal(first.STRIPE_WEBHOOK_SECRET, "whsec_fixture");
  assert.deepEqual(await configureProductionStripe(fake, "https://www.declaut.ro", first.STRIPE_WEBHOOK_SECRET), first);
  assert.equal(productCreates, 1); assert.equal(prices.length, 2); assert.equal(portalCreates, 1); assert.equal(webhookCreates, 1);
  assert.deepEqual(prices.map((price) => price.unit_amount), [30000, 50000]);
  assert.deepEqual(prices.map((price) => price.recurring), [{ interval: "month", interval_count: 6 }, { interval: "year", interval_count: 1 }]);
  assert.equal(portals[0].features.subscription_cancel.mode, "at_period_end");
  assert.equal(portals[0].features.subscription_update.enabled, false);
  await assert.rejects(configureProductionStripe(fake, "https://www.declaut.ro"), /already exists/);
  assert.equal(webhookCreates, 1);
});
