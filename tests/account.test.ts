import assert from "node:assert/strict";
import { test } from "node:test";
import { accountEntitlement, documentUrl, proDeadline, type Subscription } from "../src/lib/account/entitlements";
import { createDeviceRemovalHandler } from "../src/lib/account/remove-device";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentHistory, type PaymentDocument } from "../src/components/account/payment-history";

const now = Date.parse("2026-10-24T12:00:00Z");
const base: Subscription = { id: "sub_test", price_id: "price_test", status: "active", current_period_start: "2026-10-23T12:00:00Z", current_period_end: "2027-04-23T12:00:00Z", cancel_at_period_end: false, is_pro: true };

test("Account entitlement matches license status, grace and period rules", () => {
  assert.equal(accountEntitlement([], now).plan, "free");
  assert.equal(accountEntitlement([base], now).plan, "pro");
  assert.equal(proDeadline({ ...base, is_pro: false }, now), null);
  assert.equal(proDeadline({ ...base, current_period_start: "2026-10-25T00:00:00Z" }, now), null);
  assert.equal(proDeadline({ ...base, current_period_end: "2026-10-24T12:00:00Z" }, now), null);
  for (const status of ["canceled", "unpaid", "incomplete", "paused"]) assert.equal(proDeadline({ ...base, status }, now), null);
  const grace = { ...base, status: "past_due", current_period_start: "2026-10-22T12:00:00Z" };
  assert.equal(accountEntitlement([grace], now).proUntil, "2026-10-25T12:00:00.000Z");
  assert.equal(accountEntitlement([{ ...grace, current_period_start: "2026-10-21T12:00:00Z" }], now).plan, "free");
  assert.equal(accountEntitlement([{ ...base, cancel_at_period_end: true }], now).plan, "pro");
});

test("Multiple subscriptions use the longest eligible deadline, not latest status alone", () => {
  const canceled = { ...base, id: "sub_canceled", status: "canceled", current_period_end: "2028-01-01T00:00:00Z" };
  assert.equal(accountEntitlement([canceled, base], now).subscription?.id, "sub_test");
});

test("Payment document links reject script, plaintext, credentials and lookalike Stripe hosts", () => {
  assert.equal(documentUrl("javascript:alert(1)"), null);
  assert.equal(documentUrl("http://example.com"), null);
  assert.equal(documentUrl("https://secret:pass@stripe.com"), null);
  assert.equal(documentUrl("https://stripe.com.evil.test", true), null);
  assert.equal(documentUrl("https://invoice.stripe.com/i/test", true), "https://invoice.stripe.com/i/test");
});

const payment: PaymentDocument = { id: "in_manual", status: "paid", currency: "ron", amount_paid: 30000, stripe_invoice_number: "STRIPE-001", stripe_hosted_invoice_url: "https://invoice.stripe.com/i/test", fiscal_number: null, fiscal_pdf_url: null, created_at: "2026-11-09T00:00:00Z" };

test("Payment history explains manual invoicing without presenting legacy fiscal states as automatic progress", () => {
  for (const fiscal_status of ["pending", "failed", "not_due"]) {
    const html = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [{ ...payment, ...{ fiscal_status } }] }));
    assert.match(html, /Facturile fiscale sunt emise manual de contabil și sunt comunicate separat/);
    assert.match(html, /Factura fiscală este gestionată separat/);
    assert.match(html, /STRIPE-001/);
    assert.match(html, /href="https:\/\/invoice\.stripe\.com\/i\/test"/);
    assert.match(html, /href="\/contact"/);
    assert.doesNotMatch(html, /Factura fiscală: în așteptare|în curs de verificare|după configurarea/);
  }
});

test("Payment history preserves real saved fiscal documents and rejects unsafe document links", () => {
  const issued = { ...payment, fiscal_number: "F 12", fiscal_pdf_url: "https://www.oblio.eu/utils/show_file/?id=old" };
  const html = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [issued] }));
  assert.match(html, /Factura F 12/);
  assert.match(html, /href="https:\/\/www\.oblio\.eu\/utils\/show_file\//);
  assert.doesNotMatch(html, /Factura fiscală este gestionată separat/);
  const unsafe = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [{ ...issued, fiscal_pdf_url: "javascript:alert(1)", stripe_hosted_invoice_url: "https://stripe.com.evil.test/invoice" }] }));
  assert.match(unsafe, /Factura F 12/);
  assert.doesNotMatch(unsafe, /javascript:|stripe\.com\.evil/);
});

test("Zero-amount, unpaid and unavailable payment history never promises an automatically issued invoice", () => {
  const zero = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [{ ...payment, amount_paid: 0 }] }));
  assert.match(zero, /Nu s-a încasat nicio sumă/);
  assert.doesNotMatch(zero, /Factura fiscală este gestionată separat/);
  const unpaid = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [{ ...payment, status: "open", amount_paid: 0 }] }));
  assert.match(unpaid, /Plata nu este confirmată/);
  const unavailable = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [payment], unavailable: true }));
  assert.match(unavailable, /Documentele nu sunt disponibile momentan/);
  assert.doesNotMatch(unavailable, /STRIPE-001/);
  const empty = renderToStaticMarkup(createElement(PaymentHistory, { invoices: [] }));
  assert.match(empty, /Încă nu ai documente de plată/);
  assert.match(empty, /Facturile fiscale sunt emise manual/);
});

const rowId = "fe625fba-179a-4a72-833b-dc0943211671";
const request = (origin = "https://declaut.test") => new Request(`https://declaut.test/api/devices/${rowId}`, { method: "DELETE", headers: { Origin: origin } });

test("Device removal rejects cross-origin and unauthenticated requests without mutation", async () => {
  let writes = 0;
  const handler = createDeviceRemovalHandler({ user: async () => null, remove: async () => { writes++; return true; } });
  assert.equal((await handler(request("https://evil.test"), rowId)).status, 403);
  assert.equal((await handler(request(), rowId)).status, 401);
  assert.equal((await handler(request(), "invalid")).status, 400);
  assert.equal(writes, 0);
});

test("Device removal uses verified identity and treats foreign/missing devices identically", async () => {
  const handler = createDeviceRemovalHandler({ user: async () => ({ id: "verified-owner" }), remove: async (userId, id) => { assert.equal(userId, "verified-owner"); assert.equal(id, rowId); return false; } });
  assert.equal((await handler(request(), rowId)).status, 404);
  const success = createDeviceRemovalHandler({ user: async () => ({ id: "verified-owner" }), remove: async () => true });
  const response = await success(request(), rowId);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { removed: true });
});
