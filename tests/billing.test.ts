import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { BillingError, billingReadiness, PRO_TRIAL_DAYS, readBillingConfig, type BillingConfig } from "../src/lib/billing/config";
import { createBillingHandler } from "../src/lib/billing/http";
import { createWebhookHandler } from "../src/lib/billing/webhook";
import { createStripeGateway } from "../src/lib/billing/stripe-adapter";
import { invoiceSnapshot, subscriptionSnapshot, validPrice } from "../src/lib/billing/snapshots";
import type { BillingProfile, BillingStore, CheckoutReservation, InvoiceSnapshot, StripeEvent, StripeGateway, SubscriptionSnapshot } from "../src/lib/billing/types";
import production from "../docs/track-b-production-config.json";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/stripe/${name}.json`, import.meta.url), "utf8"));
const active = fixture("subscription-active");
const paid = fixture("invoice-paid");
const checkout = fixture("checkout");
const events = fixture("events") as StripeEvent[];
const userId = "11111111-1111-4111-8111-111111111111";
const config: BillingConfig = { secretKey: "sk_test_fixture_not_real", webhookSecret: "whsec_fixture_not_real", prices: { semiannual: "price_semiannual_fixture", yearly: "price_yearly_fixture" }, mode: "test" };
const sdk = new Stripe(config.secretKey);

class MemoryStore implements BillingStore {
  profile: BillingProfile = { id: userId, email: "fixture@example.invalid", company_name: "Fixture SRL", cui: "RO123456", stripe_customer_id: null };
  generations = new Map<string, number>();
  subscriptions = new Map<string, SubscriptionSnapshot>();
  invoices = new Map<string, InvoiceSnapshot>();
  processed = new Set<string>();
  reservation?: { price: string; value: CheckoutReservation };
  applied = 0;
  async getProfile() { return { ...this.profile }; }
  async bindCustomer(_user: string, customer: string) { this.profile.stripe_customer_id ??= customer; return this.profile.stripe_customer_id; }
  async reserveCheckout(_user: string, price: string): Promise<CheckoutReservation> {
    if (this.reservation) return this.reservation.price === price && this.reservation.value.state === "existing" ? this.reservation.value : { state: "busy" };
    const value = { state: "reserved", token: "reservation-token" } as const;
    this.reservation = { price, value }; return value;
  }
  async finishCheckout(_user: string, _token: string, _id: string, url: string) { this.reservation!.value = { state: "existing", url }; return true; }
  async releaseCheckout() { if (this.reservation?.value.state === "reserved") this.reservation = undefined; }
  async eventProcessed(id: string) { return this.processed.has(id); }
  async customerOwner(customer: string) { return customer === "cus_fixture" ? userId : null; }
  async beginSync(id: string) { const next = (this.generations.get(id) ?? 0) + 1; this.generations.set(id, next); return next; }
  async applySync(generation: number, subscription: SubscriptionSnapshot, invoice?: InvoiceSnapshot) {
    if (this.generations.get(subscription.id) !== generation) return false;
    this.subscriptions.set(subscription.id, subscription); if (invoice) this.invoices.set(invoice.id, invoice); this.applied++; return true;
  }
  async completeEvent(id: string) { this.processed.add(id); }
}

function gateway(overrides: Partial<StripeGateway> = {}): StripeGateway {
  return {
    price: async (id) => id === config.prices.semiannual ? active.items.data[0].price : { id, active: true, currency: "ron", unit_amount: 50000, recurring: { interval: "year", interval_count: 1 } },
    customer: async () => ({ id: "cus_fixture", metadata: { user_id: userId } }),
    createCustomer: async () => ({ id: "cus_fixture" }),
    hasSubscriptionHistory: async () => false,
    createCheckout: async () => ({ id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture", expires_at: Math.floor(Date.now() / 1000) + 1800 }),
    createPortal: async () => ({ url: "https://billing.stripe.com/p/session/fixture" }),
    subscription: async () => structuredClone(active), checkout: async () => structuredClone(checkout), invoice: async () => structuredClone(paid),
    event: (raw, signature, secret) => sdk.webhooks.constructEvent(raw, signature, secret) as unknown as StripeEvent,
    ...overrides,
  };
}
function signedRequest(event: StripeEvent, secret = config.webhookSecret!) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://declaut.test/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": signature, "Content-Type": "application/json" }, body: payload });
}
function paymentRequest(interval: unknown = "semiannual", origin = "https://declaut.test") {
  return new Request("https://declaut.test/api/checkout", { method: "POST", headers: { Origin: origin, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ interval }) });
}

test("Billing stays disabled without configured test keys/prices and rejects live-money checkout", () => {
  assert.equal(billingReadiness({}).checkoutReady, false);
  assert.throws(() => readBillingConfig({}), BillingError);
  const configured = { STRIPE_SECRET_KEY: config.secretKey, STRIPE_WEBHOOK_SECRET: config.webhookSecret, STRIPE_PRICE_SEMIANNUAL: config.prices.semiannual, STRIPE_PRICE_YEARLY: config.prices.yearly };
  assert.equal(billingReadiness(configured).webhookReady, true);
  assert.equal(billingReadiness({ ...configured, STRIPE_SECRET_KEY: "sk_live_fixture" }).checkoutReady, false);
  assert.equal(billingReadiness({ ...configured, STRIPE_PRICE_YEARLY: config.prices.semiannual }).checkoutReady, false);
  assert.equal(billingReadiness({ ...configured, LICENSE_ISSUER: "declaut-production" }).checkoutReady, false);
  assert.equal(billingReadiness({ ...configured, NEXT_PUBLIC_SUPABASE_URL: production.supabaseUrl }).webhookReady, false);
});

test("Live checkout supports manual invoicing without provider credentials or a fiscal release flag", () => {
  const env = { STRIPE_SECRET_KEY: "sk_live_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_PRICE_SEMIANNUAL: "price_a", STRIPE_PRICE_YEARLY: "price_b", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", SITE_URL: production.websiteUrl, NEXT_PUBLIC_SUPABASE_URL: production.supabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: production.supabasePublishableKey, SUPABASE_SERVICE_ROLE_KEY: "fixture", LICENSE_PRIVATE_KEY_BASE64: "fixture", LICENSE_KEY_ID: production.license.publicKey.kid, LICENSE_ISSUER: production.license.issuer, LICENSE_AUDIENCE: production.license.audience, COMPANY_LEGAL_NAME: "Operator", COMPANY_CUI: "26143268", COMPANY_ADDRESS: "Craiova", CONTACT_EMAIL: "owner@example.test", GITHUB_RELEASE_CHANNEL: "stable", BILLING_LIVE_ENABLED: "true" };
  assert.equal(billingReadiness(env).checkoutReady, true);
  assert.equal(readBillingConfig(env).mode, "live");
  assert.equal(billingReadiness({ ...env, FISCAL_LIVE_READY: "false", OBLIO_CLIENT_SECRET: "", OBLIO_COMPANY_CIF: "retired" }).checkoutReady, true);
  const disabled = { ...env, BILLING_LIVE_ENABLED: "false" };
  assert.equal(billingReadiness(disabled).checkoutReady, false);
  assert.equal(billingReadiness(disabled).portalReady, true);
  assert.equal(readBillingConfig(disabled, true).mode, "live");
  assert.equal(readBillingConfig(disabled, false, true).mode, "live");
  for (const override of [{ LICENSE_ISSUER: "declaut-staging" }, { SITE_URL: "https://wrong.example" }, { GITHUB_RELEASE_CHANNEL: "preview" }, { STRIPE_WEBHOOK_SECRET: "" }, { STRIPE_PORTAL_CONFIGURATION_ID: "" }, { STRIPE_PRICE_YEARLY: "price_a" }]) assert.equal(billingReadiness({ ...env, ...override }).checkoutReady, false);
});

test("Live checkout requires production terms acceptance but existing customers can still open the cancellation portal", async () => {
  const store = new MemoryStore(); store.profile.stripe_customer_id = "cus_fixture";
  const deps = { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => ({ ...config, mode: "live" as const }), store: () => store, stripe: () => gateway() };
  const checkout = await createBillingHandler("checkout", deps)(paymentRequest());
  assert.equal(checkout.status, 403);
  assert.equal((await checkout.json()).error.code, "terms_acceptance_required");
  assert.equal((await createBillingHandler("portal", deps)(paymentRequest())).status, 200);
});

test("Live paid invoices reconcile once without an invoicing provider or a buyer-profile lookup", async () => {
  const store = new MemoryStore();
  store.getProfile = async () => { throw new Error("Manual invoicing must not load buyer data for a provider"); };
  const event = { ...events.find((event) => event.type === "invoice.paid")!, livemode: true };
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw new Error("Unexpected external provider request"); };
  try {
    const handler = createWebhookHandler({ config: () => ({ ...config, mode: "live" }), store: () => store, stripe: () => gateway() });
    assert.equal((await handler(signedRequest(event))).status, 200);
    const replay = await handler(signedRequest(event));
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { received: true, duplicate: true });
    assert.equal(store.invoices.size, 1);
    assert.equal(store.invoices.get(paid.id)?.amount_paid, paid.amount_paid);
    assert.equal(store.subscriptions.get(active.id)?.is_pro, true);
    assert.equal(store.processed.has(event.id), true);
    assert.equal(store.applied, 1);
    assert.equal(externalCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Live zero-amount trial invoices and failed payments are recorded without claiming fiscal issuance", async () => {
  for (const [type, status] of [["invoice.paid", "paid"], ["invoice.payment_failed", "open"]]) {
    const store = new MemoryStore();
    const event = { ...events.find((event) => event.type === type)!, livemode: true };
    const handler = createWebhookHandler({ config: () => ({ ...config, mode: "live" }), store: () => store, stripe: () => gateway({ invoice: async () => ({ ...paid, status, amount_paid: 0 }) }) });
    assert.equal((await handler(signedRequest(event))).status, 200);
    assert.equal(store.invoices.get(paid.id)?.amount_paid, 0);
    assert.equal(store.invoices.get(paid.id)?.status, status);
    assert.equal(store.processed.has(event.id), true);
  }
});

test("Live database failures stay retryable and replay retains one payment record", async () => {
  const store = new MemoryStore();
  let attempts = 0;
  store.completeEvent = async (id) => { if (++attempts === 1) throw new Error("Temporary database failure"); store.processed.add(id); };
  const event = { ...events.find((event) => event.type === "invoice.paid")!, livemode: true };
  const handler = createWebhookHandler({ config: () => ({ ...config, mode: "live" }), store: () => store, stripe: () => gateway() });
  assert.equal((await handler(signedRequest(event))).status, 503);
  assert.equal(store.processed.has(event.id), false);
  assert.equal((await handler(signedRequest(event))).status, 200);
  assert.equal(store.invoices.size, 1);
  assert.equal(store.processed.has(event.id), true);
});

test("Stripe mode mismatches and invalid live signatures fail before database work", async () => {
  let databaseCalls = 0;
  const event = events.find((event) => event.type === "invoice.paid")!;
  for (const mode of ["test", "live"] as const) {
    const handler = createWebhookHandler({ config: () => ({ ...config, mode }), store: () => { databaseCalls++; return new MemoryStore(); }, stripe: () => gateway() });
    assert.equal((await handler(signedRequest({ ...event, livemode: mode !== "live" }))).status, 400);
    assert.equal((await handler(signedRequest({ ...event, livemode: mode === "live" }, "wrong-secret"))).status, 400);
  }
  assert.equal(databaseCalls, 0);
});

test("Only the exact published RON amounts and half-year/year periods are accepted", () => {
  const price = active.items.data[0].price;
  assert.equal(validPrice(price, "semiannual"), true);
  for (const changed of [{ ...price, unit_amount: 29900 }, { ...price, currency: "eur" }, { ...price, recurring: { interval: "month", interval_count: 1 } }, { ...price, active: false }]) assert.equal(validPrice(changed, "semiannual"), false);
  const unknown = structuredClone(active); unknown.items.data[0].price.id = "price_other";
  assert.equal(subscriptionSnapshot(unknown, config).is_pro, false);
  const mixed = structuredClone(active); mixed.items.data.push(structuredClone(mixed.items.data[0]));
  assert.equal(subscriptionSnapshot(mixed, config).is_pro, false);
  const missingPeriod = structuredClone(active); delete missingPeriod.items.data[0].current_period_start;
  assert.equal(subscriptionSnapshot(missingPeriod, config).is_pro, false);
});

test("Checkout authenticates, checks Origin and rejects caller-supplied arbitrary prices", async () => {
  let calls = 0;
  const handler = createBillingHandler("checkout", { authenticate: async () => { calls++; return { id: userId, email: "fixture@example.invalid" }; }, config: () => config, store: () => new MemoryStore(), stripe: () => gateway() });
  assert.equal((await handler(paymentRequest("semiannual", "https://evil.example"))).status, 403);
  assert.equal(calls, 0);
  assert.equal((await handler(paymentRequest("price_other"))).status, 400);
  const unauthorized = createBillingHandler("checkout", { authenticate: async () => { throw new BillingError(401, "unauthorized"); }, config: () => config, store: () => new MemoryStore(), stripe: () => gateway() });
  assert.equal((await unauthorized(paymentRequest())).status, 401);
});

test("Checkout reuses its customer and active session instead of starting duplicate payments", async () => {
  const store = new MemoryStore(); let customers = 0; let sessions = 0;
  const stripe = gateway({ createCustomer: async (_profile, key) => { customers++; assert.equal(key, `declaut-customer:test:${userId}`); return { id: "cus_fixture" }; }, createCheckout: async (customer, user, price, origin, key, trial) => {
    sessions++; assert.equal(customer, "cus_fixture"); assert.equal(user, userId); assert.equal(price, config.prices.semiannual); assert.equal(origin, "https://declaut.test"); assert.equal(key, "declaut-checkout:reservation-token");
    assert.equal(trial, true);
    return { id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture", expires_at: Date.now() / 1000 + 1800 };
  } });
  const handler = createBillingHandler("checkout", { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => config, store: () => store, stripe: () => stripe });
  assert.equal((await handler(paymentRequest())).status, 200);
  assert.equal((await handler(paymentRequest())).status, 200);
  assert.equal((await handler(paymentRequest("yearly"))).status, 409);
  assert.equal(customers, 1); assert.equal(sessions, 1);
});

test("Stripe SDK adapter sends required address/tax collection, subscription mode and fixed return URLs", async () => {
  let received: Record<string, unknown> | undefined; let requestKey: string | undefined;
  const fake = { checkout: { sessions: { create: async (params: Record<string, unknown>, options: { idempotencyKey: string }) => { received = params; requestKey = options.idempotencyKey; return { id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture", expires_at: 1900000000 }; } } } } as unknown as Stripe;
  await createStripeGateway(config, fake).createCheckout("cus_fixture", userId, config.prices.semiannual, "https://declaut.test", "test-reservation", true);
  assert.equal(received?.mode, "subscription"); assert.equal(received?.billing_address_collection, "required");
  assert.deepEqual(received?.tax_id_collection, { enabled: true });
  assert.equal(received?.payment_method_collection, "always");
  assert.deepEqual(received?.allowed_payment_method_types, ["card"]);
  assert.deepEqual(received?.subscription_data, { metadata: { user_id: userId }, trial_period_days: PRO_TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } });
  assert.equal(received?.success_url, "https://declaut.test/account?paid=1"); assert.equal(received?.cancel_url, "https://declaut.test/account?checkout=cancelled");
  assert.equal(requestKey, "test-reservation");
  assert.ok(Number(received?.expires_at) > Date.now() / 1000 + 1800);
  await createStripeGateway(config, fake).createCheckout("cus_fixture", userId, config.prices.yearly, "https://declaut.test", "returning-reservation", false);
  assert.deepEqual(received?.subscription_data, { metadata: { user_id: userId } });
});

test("Only first subscriptions receive a trial on either paid interval", async () => {
  for (const interval of ["semiannual", "yearly"]) {
    for (const history of [false, true]) {
      let sessions = 0;
      const stripe = gateway({ hasSubscriptionHistory: async () => history, createCheckout: async (_customer, _user, _price, _origin, _key, trial) => {
        assert.equal(trial, !history); sessions++;
        return { id: "cs_returning", url: "https://checkout.stripe.com/c/pay/returning", expires_at: Date.now() / 1000 + 3600 };
      } });
      const handler = createBillingHandler("checkout", { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => config, store: () => new MemoryStore(), stripe: () => stripe });
      assert.equal((await handler(paymentRequest(interval))).status, 200);
      assert.equal(sessions, 1);
    }
  }
});

test("Trial eligibility fails closed when Stripe history cannot be checked", async () => {
  let sessions = 0;
  const handler = createBillingHandler("checkout", { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => config, store: () => new MemoryStore(), stripe: () => gateway({ hasSubscriptionHistory: async () => { throw new Error("unavailable"); }, createCheckout: async () => { sessions++; throw new Error("must not create"); } }) });
  assert.equal((await handler(paymentRequest())).status, 503);
  assert.equal(sessions, 0);
});

test("The Stripe history lookup includes canceled subscriptions", async () => {
  const fake = { subscriptions: { list: async (params: unknown) => {
    assert.deepEqual(params, { customer: "cus_fixture", status: "all", limit: 1 });
    return { data: [{ id: "sub_canceled_trial", status: "canceled" }] };
  } } } as unknown as Stripe;
  assert.equal(await createStripeGateway(config, fake).hasSubscriptionHistory("cus_fixture"), true);
});

test("Trial Pro access ends at trial_end and only then uses the selected paid billing period", () => {
  const start = active.items.data[0].current_period_start;
  const end = start + PRO_TRIAL_DAYS * 86400;
  const trial = { ...structuredClone(active), status: "trialing", trial_start: start, trial_end: end };
  const snapshot = subscriptionSnapshot(trial, config);
  assert.equal(snapshot.is_pro, true);
  assert.equal(snapshot.current_period_end, new Date(end * 1000).toISOString());
  assert.equal(subscriptionSnapshot({ ...trial, trial_end: null }, config).is_pro, false);
  assert.equal(subscriptionSnapshot({ ...trial, trial_end: start }, config).is_pro, false);
  const renewed = subscriptionSnapshot({ ...trial, status: "active" }, config);
  assert.equal(renewed.current_period_end, new Date(active.items.data[0].current_period_end * 1000).toISOString());
});

test("Native billing form errors retain the browser's real Host after Next.js loopback normalization", async () => {
  const handler = createBillingHandler("checkout", { authenticate: async () => { throw new BillingError(401, "unauthorized"); }, config: () => config, store: () => new MemoryStore(), stripe: () => gateway() });
  const request = new Request("http://localhost:3100/api/checkout", { method: "POST", headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/x-www-form-urlencoded" }, body: "interval=semiannual" });
  const response = await handler(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3100/login");
});

test("Wrong configured amount or mismatched customer blocks checkout before a payment session is created", async () => {
  for (const stripe of [gateway({ price: async () => ({ ...active.items.data[0].price, unit_amount: 99999 }) }), gateway({ customer: async () => ({ id: "cus_fixture", metadata: { user_id: "another-user" } }) })]) {
    const handler = createBillingHandler("checkout", { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => config, store: () => new MemoryStore(), stripe: () => stripe });
    assert.ok((await handler(paymentRequest())).status >= 400);
  }
});

test("Portal uses only the signed-in profile's stored customer", async () => {
  const store = new MemoryStore(); store.profile.stripe_customer_id = "cus_fixture";
  const handler = createBillingHandler("portal", { authenticate: async () => ({ id: userId, email: "fixture@example.invalid" }), config: () => config, store: () => store, stripe: () => gateway() });
  const response = await handler(paymentRequest());
  assert.equal(response.status, 200); assert.equal((await response.json()).url, "https://billing.stripe.com/p/session/fixture");
});

test("Bad webhook signatures and tampered raw bodies never reach the database", async () => {
  let stores = 0;
  const handler = createWebhookHandler({ config: () => config, stripe: () => gateway(), store: () => { stores++; return new MemoryStore(); } });
  assert.equal((await handler(signedRequest(events[1], "whsec_wrong"))).status, 400);
  const request = signedRequest(events[1]);
  const tampered = new Request(request.url, { method: "POST", headers: request.headers, body: `${JSON.stringify(events[1])} ` });
  assert.equal((await handler(tampered)).status, 400);
  assert.equal(stores, 0);
});

test("All six supported event fixtures re-fetch authoritative resources and reconcile subscription state", async () => {
  for (const event of events) {
    const store = new MemoryStore(); let subscriptionReads = 0; let invoiceReads = 0;
    const handler = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway({ subscription: async () => { subscriptionReads++; return structuredClone(active); }, invoice: async () => { invoiceReads++; return structuredClone(paid); } }) });
    assert.equal((await handler(signedRequest(event))).status, 200, event.type);
    assert.equal(subscriptionReads, 1); assert.equal(store.subscriptions.get("sub_fixture")?.status, "active");
    assert.equal(store.subscriptions.get("sub_fixture")?.is_pro, true);
    assert.equal(invoiceReads, event.type.startsWith("invoice.") ? 2 : 0);
    assert.equal(store.processed.has(event.id), true);
  }
});

test("A retried paid invoice event produces one invoice record and no fiscal issuance", async () => {
  const store = new MemoryStore(); const handler = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway() });
  const event = events.find((event) => event.type === "invoice.paid")!;
  assert.equal((await handler(signedRequest(event))).status, 200);
  const repeated = await handler(signedRequest(event));
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).duplicate, true);
  assert.equal(store.invoices.size, 1); assert.equal(store.applied, 1);
  assert.equal("fiscal_number" in store.invoices.get("in_fixture")!, false);
});

test("Out-of-order payloads cannot resurrect a canceled subscription", async () => {
  const store = new MemoryStore(); const canceled = { ...structuredClone(active), status: "canceled" };
  const handler = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway({ subscription: async () => canceled }) });
  assert.equal((await handler(signedRequest(events[3]))).status, 200);
  assert.equal((await handler(signedRequest(events[1]))).status, 200);
  assert.equal(store.subscriptions.get("sub_fixture")?.status, "canceled");
});

test("A slow old fetch cannot overwrite a newer concurrent subscription fetch", async () => {
  const store = new MemoryStore(); let releaseOld: (value: unknown) => void = () => {}; let fetched = 0;
  const waiting = new Promise<unknown>((resolve) => { releaseOld = resolve; });
  const stripe = gateway({ subscription: async () => { fetched++; return fetched === 1 ? waiting : { ...structuredClone(active), status: "canceled" }; } });
  const handler = createWebhookHandler({ config: () => config, store: () => store, stripe: () => stripe });
  const old = handler(signedRequest(events[1]));
  while (fetched === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal((await handler(signedRequest(events[2]))).status, 200);
  releaseOld(structuredClone(active));
  assert.equal((await old).status, 503);
  assert.equal(store.subscriptions.get("sub_fixture")?.status, "canceled");
  assert.equal(store.processed.has(events[1].id), false);
  assert.equal((await handler(signedRequest(events[1]))).status, 200);
  assert.equal(store.subscriptions.get("sub_fixture")?.status, "canceled");
});

test("Unallowlisted plans keep Stripe status but never grant Pro", async () => {
  const store = new MemoryStore(); const unknown = structuredClone(active); unknown.items.data[0].price.id = "price_other";
  const handler = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway({ subscription: async () => unknown }) });
  assert.equal((await handler(signedRequest(events[1]))).status, 200);
  assert.equal(store.subscriptions.get("sub_fixture")?.status, "active"); assert.equal(store.subscriptions.get("sub_fixture")?.is_pro, false);
});

test("Customer ownership mismatch is rejected; unmapped customers are ignored", async () => {
  const store = new MemoryStore();
  const mismatch = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway({ checkout: async () => ({ ...checkout, client_reference_id: "other-user" }) }) });
  assert.equal((await mismatch(signedRequest(events[0]))).status, 400);
  const unrelated = createWebhookHandler({ config: () => config, store: () => store, stripe: () => gateway({ subscription: async () => ({ ...structuredClone(active), customer: "cus_unrelated" }) }) });
  assert.equal((await unrelated(signedRequest(events[1]))).status, 200); assert.equal(store.applied, 0);
});

test("Invoice links are constrained to Stripe hosts", () => {
  const malicious = { ...paid, hosted_invoice_url: "https://evil.example/invoice", invoice_pdf: "javascript:alert(1)" };
  const result = invoiceSnapshot(malicious);
  assert.equal(result.stripe_hosted_invoice_url, null); assert.equal(result.stripe_invoice_pdf_url, null);
});
