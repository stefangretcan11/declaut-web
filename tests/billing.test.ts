import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { BillingError, billingReadiness, readBillingConfig, type BillingConfig } from "../src/lib/billing/config";
import { createBillingHandler } from "../src/lib/billing/http";
import { createWebhookHandler } from "../src/lib/billing/webhook";
import { createStripeGateway } from "../src/lib/billing/stripe-adapter";
import { invoiceSnapshot, subscriptionSnapshot, validPrice } from "../src/lib/billing/snapshots";
import type { BillingProfile, BillingStore, CheckoutReservation, InvoiceSnapshot, StripeEvent, StripeGateway, SubscriptionSnapshot } from "../src/lib/billing/types";

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
  const stripe = gateway({ createCustomer: async (_profile, key) => { customers++; assert.equal(key, `declaut-customer:test:${userId}`); return { id: "cus_fixture" }; }, createCheckout: async (customer, user, price, origin, key) => {
    sessions++; assert.equal(customer, "cus_fixture"); assert.equal(user, userId); assert.equal(price, config.prices.semiannual); assert.equal(origin, "https://declaut.test"); assert.equal(key, "declaut-checkout:reservation-token");
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
  await createStripeGateway(config, fake).createCheckout("cus_fixture", userId, config.prices.semiannual, "https://declaut.test", "test-reservation");
  assert.equal(received?.mode, "subscription"); assert.equal(received?.billing_address_collection, "required");
  assert.deepEqual(received?.tax_id_collection, { enabled: true });
  assert.equal(received?.success_url, "https://declaut.test/account?paid=1"); assert.equal(received?.cancel_url, "https://declaut.test/account?checkout=cancelled");
  assert.equal(requestKey, "test-reservation");
  assert.ok(Number(received?.expires_at) > Date.now() / 1000 + 1800);
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
