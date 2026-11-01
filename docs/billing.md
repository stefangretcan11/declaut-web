# Stripe billing implementation and test setup

The integration is implemented and fixture-tested. No Stripe account, real test keys or provider webhook endpoint has been configured yet; real Checkout and Customer Portal acceptance remain pending.

## Plans approved by the owner

| Plan | Amount | Stripe recurring interval |
| --- | --- | --- |
| Pro for six months | 300 RON (`unit_amount=30000`) | `interval=month`, `interval_count=6` |
| Pro yearly | 500 RON (`unit_amount=50000`) | `interval=year`, `interval_count=1` |

There is no monthly plan. The backend retrieves each configured price and verifies its currency, exact amount, active state and interval before creating a checkout. Display prices alone do not enable billing.

## Configure a Stripe sandbox

After the owner creates the Stripe account:

1. Create product **Declaut Pro** and the two recurring RON prices above in the sandbox/test environment.
2. Configure the Customer Portal to allow switching between those prices, updating the card, viewing payment documents and canceling at the end of the current period. Keep quantity changes disabled for this single-license product.
3. Configure these server environment variables on the dedicated staging Vercel project:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_SEMIANNUAL=price_...
STRIPE_PRICE_YEARLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
SITE_URL=https://declaut-web.vercel.app
```

4. Register the exact deployed `POST /api/stripe/webhook` endpoint for:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

5. Use an event/API version matching the locked Stripe SDK. The installed Stripe 23.0.1 SDK uses `2026-09-30.endive`; verify this again when upgrading. Subscription period timestamps are read from the subscription item, not obsolete top-level fields.
6. Redeploy, then verify actual test-card checkout, portal access, subscription renewal/cancellation, failure grace and webhook replay. This is separate from the tests already run against fixtures.

Keep all Stripe secret and webhook keys server-side. Live keys deliberately fail closed in this milestone: A6 fiscal invoicing and its acceptance checks must exist before real money can be accepted.

## HTTP endpoints

`POST /api/checkout` accepts JSON or a form with `interval=semiannual` or `interval=yearly`. It requires a confirmed cookie-authenticated user and a matching browser Origin. The server chooses the price ID; a caller-supplied arbitrary price is rejected. Checkout uses subscription mode, requires the billing address and enables tax ID collection. Success returns to `/account?paid=1`; the account never grants Pro based on that query parameter.

`POST /api/portal` uses the customer ID stored on the authenticated user's profile. It does not accept a customer ID from the caller. The customer is verified against Stripe before creating a portal session.

JSON callers receive `{ "url": "https://...stripe.com/..." }`. Native forms receive a 303 redirect. Missing provider configuration returns a controlled `billing_unavailable` response; the account hides unavailable payment actions. Authentication errors and Origin failures are handled before payment creation.

## Customer and checkout reuse

The customer-creation request has a stable user-scoped Stripe idempotency key. A database function binds the first customer ID under a profile lock; customer IDs cannot be shared across profiles.

Checkout requests reserve one session per user under the same profile lock. Repeated requests reuse the stored unexpired checkout URL. A concurrent different-plan request is rejected while a checkout is active, and an existing nonterminal subscription must be managed through the portal. Stripe session expiry is stored with the URL.

## Authoritative webhook reconciliation

The handler verifies the signature against the raw, bounded request body before any database work. It retrieves the current Checkout session, invoice and/or subscription from Stripe rather than relying on event payload state.

Each subscription reconciliation allocates a database generation before retrieval. The atomic apply function rejects an older generation once a newer reconciliation has started, preventing a slow old fetch from overwriting a newer result. Stale/failed work is retryable and is not marked complete. Event IDs are recorded only after successful application; invoice IDs are unique, so replay cannot create duplicate invoice rows.

Only allowlisted price IDs with the approved amounts and intervals set `subscriptions.is_pro=true`. Unexpected or mixed plans retain their actual Stripe status but fail closed for Pro access. Both the account summary and desktop license resolver honor this flag. Manually inserted staging subscription fixtures default to true for Track A/Track B testing.

## Payment documents and A6

`billing_invoices` stores the Stripe invoice ID, customer owner, subscription, status, paid amount, currency and safe Stripe document URLs. Owner-only RLS allows users to read their own records, with all writes through the server. The table also reserves separate fields for fiscal issuance state, fiscal number and provider PDF URL.

This code does **not** issue Romanian fiscal invoices or submit to e-Factura. A paid Stripe invoice records `fiscal_status=pending`; an unpaid document is `not_due`. Stripe webhook retries preserve fiscal fields that a future A6 integration has already issued. The account explicitly distinguishes Stripe payment documents from fiscal invoices.

## Verification already performed

- Signed fixture events use the real Stripe SDK signature verifier and dependency-injected handler factories; no payment-provider request is made.
- Tests cover all six event types, tampered bodies/signatures, duplicate and out-of-order events, slow concurrent fetches, ownership mismatch and unknown prices.
- Disposable PostgreSQL tests cover customer binding, concurrent checkout reservation, fencing, invoice uniqueness/fiscal-field preservation, RLS and denial of client access to server-only tables/functions.
- Browser tests against staging cover account plan/renewal display, paid-document/fiscal-pending presentation, Pro on all registered devices, device removal and disabled billing endpoints when no Stripe key is configured. Apply all migrations, including removal of the device cap, before running the updated tests.

References: [Stripe Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhook signature verification](https://docs.stripe.com/webhooks/signature), [Stripe API idempotency](https://docs.stripe.com/api/idempotent_requests), [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks).
