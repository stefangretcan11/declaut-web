import assert from "node:assert/strict";
import { test } from "node:test";
import { createOblioIssuer, FiscalError, readOblioConfig } from "../src/lib/billing/oblio";
import { createFiscalRetryHandler } from "../src/lib/billing/retry";
import type { BillingProfile, InvoiceSnapshot } from "../src/lib/billing/types";

const env = { OBLIO_CLIENT_ID: "owner@example.test", OBLIO_CLIENT_SECRET: "fixture-secret", OBLIO_COMPANY_CIF: "26143268", OBLIO_INVOICE_SERIES: "F", OBLIO_VAT_PERCENT: "0" };
const profile: BillingProfile = { id: "user", email: "buyer@example.test", company_name: "Buyer SRL", cui: "12345678", stripe_customer_id: "cus_test" };
const invoice: InvoiceSnapshot = { id: "in_paid_fixture", customer_id: "cus_test", subscription_id: "sub_test", status: "paid", currency: "ron", amount_paid: 30000, total: 30000, fiscal_issue_date: "2026-11-08", stripe_invoice_number: null, stripe_hosted_invoice_url: null, stripe_invoice_pdf_url: null, created_at: "2026-11-08T10:00:00Z", buyer: { name: "Buyer SRL", email: "buyer@example.test", cui: "12345678", address: "Street 1", city: "Craiova", state: "Dolj", country: "RO" } };

function provider(overrides: { rates?: object[]; invoiceResponse?: Response } = {}) {
  let auth = 0;
  const payloads: Record<string, any>[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://www.oblio.eu");
    assert.equal(init?.redirect, "error");
    if (url.pathname.endsWith("/token")) { auth++; return Response.json({ access_token: "fixture-token", expires_in: "3600" }); }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-token");
    if (url.pathname.endsWith("vat_rates")) return Response.json({ status: 200, data: overrides.rates ?? [{ name: "Neplatitor", percent: 0, default: true }] });
    assert.equal(url.pathname, "/api/docs/invoice");
    payloads.push(JSON.parse(String(init?.body)));
    return overrides.invoiceResponse?.clone() ?? Response.json({ status: 200, data: { seriesName: "F", number: "0001", link: "https://www.oblio.eu/utils/show_file/?id=fixture" } });
  }) as typeof fetch;
  return { fetcher, payloads, auth: () => auth };
}

test("Oblio configuration requires explicit VAT and private credentials", () => {
  assert.equal(readOblioConfig(env).OBLIO_VAT_PERCENT, 0);
  for (const overrides of [{ OBLIO_VAT_PERCENT: "" }, { OBLIO_VAT_PERCENT: undefined }, { OBLIO_CLIENT_SECRET: "" }, { OBLIO_COMPANY_CIF: "invalid" }]) {
    assert.throws(() => readOblioConfig({ ...env, ...overrides }), FiscalError);
  }
});

test("Oblio emits the exact paid RON amount, discovers the zero VAT rate and reuses the invoice idempotency key", async () => {
  const fake = provider();
  let now = Date.parse("2026-11-08T22:00:00Z");
  const issue = createOblioIssuer(readOblioConfig(env), fake.fetcher, () => now);
  const first = await issue(invoice, profile);
  now += 60_000;
  assert.deepEqual(await issue(invoice, profile), first);
  assert.equal(fake.auth(), 1);
  assert.equal(fake.payloads.length, 2);
  assert.equal(fake.payloads[0].idempotencyKey, "declaut-stripe-in_paid_fixture");
  assert.deepEqual(fake.payloads[0], fake.payloads[1]);
  assert.equal(fake.payloads[0].issueDate, "2026-11-08");
  assert.equal(fake.payloads[0].products[0].price, 300);
  assert.equal(fake.payloads[0].products[0].vatPercentage, 0);
  assert.equal(fake.payloads[0].products[0].vatName, "Neplatitor");
  assert.equal(fake.payloads[0].products[0].vatIncluded, 1);
  assert.deepEqual(fake.payloads[0].collect, { type: "Card", documentNumber: invoice.id, value: 300 });
  assert.equal(fake.payloads[0].spvExtern, 1);
  assert.equal(first.number, "F 0001");
});

test("Oblio refuses unsupported amounts, missing buyer data and ambiguous VAT before creating a document", async () => {
  for (const changed of [{ ...invoice, total: 50000 }, { ...invoice, amount_paid: 0 }, { ...invoice, currency: "eur" }, { ...invoice, buyer: undefined }]) {
    const fake = provider();
    await assert.rejects(createOblioIssuer(readOblioConfig(env), fake.fetcher)(changed, profile), FiscalError);
    assert.equal(fake.payloads.length, 0);
  }
  const fake = provider({ rates: [{ name: "A", percent: 0 }, { name: "B", percent: 0 }] });
  await assert.rejects(createOblioIssuer(readOblioConfig(env), fake.fetcher)(invoice, profile), /fiscal_vat_requires_review/);
  assert.equal(fake.payloads.length, 0);
});

test("Oblio rejects foreign document URLs and sanitizes provider errors", async () => {
  for (const response of [Response.json({ status: 200, data: { seriesName: "F", number: "1", link: "https://oblio.eu.evil.test/invoice" } }), Response.json({ private: "provider-secret" }, { status: 500 })]) {
    const fake = provider({ invoiceResponse: response });
    await assert.rejects(createOblioIssuer(readOblioConfig(env), fake.fetcher)(invoice, profile), (error: unknown) => error instanceof FiscalError && !error.message.includes("provider-secret"));
  }
});

test("Fiscal retry authentication precedes all database/provider work and reports only counts", async () => {
  let reads = 0;
  const handler = createFiscalRetryHandler({ secret: "fixture-cron", pending: async () => { reads++; return [{ id: "in_a", user_id: "u" }, { id: "in_b", user_id: "u" }]; }, retry: async (row) => { if (row.id === "in_b") throw new Error("private provider response"); } });
  const request = (token?: string) => new Request("https://declaut.example/api/internal/fiscal/retry", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await handler(request())).status, 401);
  assert.equal((await handler(request("wrong"))).status, 401);
  assert.equal(reads, 0);
  const result = await handler(request("fixture-cron"));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { processed: 1, failed: 1 });
  const disabled = createFiscalRetryHandler({ pending: async () => { throw new Error("must not read"); }, retry: async () => {} });
  assert.equal((await disabled(request())).status, 503);
});
