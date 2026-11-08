# Stripe billing implementation and test setup

Current state — 8 November 2026: Stripe and Oblio integrations are implemented and fixture-tested. Live checkout requires explicit production/fiscal acceptance gates. Provider credentials are not available in this local checkout; hosted provider configuration has not been inspected. Follow [production setup](production-setup.md). Real Checkout, Portal, fiscal and SPV acceptance remain pending.

## Plans approved by the owner

| Plan | Amount | Stripe recurring interval |
| --- | --- | --- |
| Pro for six months | 300 RON (`unit_amount=30000`) | `interval=month`, `interval_count=6` |
| Pro yearly | 500 RON (`unit_amount=50000`) | `interval=year`, `interval_count=1` |

There is no monthly plan. The backend retrieves each configured price and verifies its currency, exact amount, active state and interval before creating a checkout. Display prices alone do not enable billing.

## First Pro activation: 30 days free, card upfront

The first Pro Checkout includes `subscription_data.trial_period_days=30`. Both paid options keep their full recurring period **after** the trial: 300 RON for six months or 500 RON for twelve months. Checkout explicitly requires a payment method and filters the allowed methods to cards. If the card is removed before the trial ends, the trial's missing-payment-method behavior is cancellation.

Trial eligibility is determined server-side from the bound Stripe customer's subscription history (`status=all`, including canceled subscriptions). Any previous subscription prevents a second trial, including after cancellation, switching plans or reinstalling the desktop app. An abandoned Checkout without a subscription does not consume the trial. History lookup failure blocks creation; callers cannot request a trial themselves. Existing checkout reservation/customer reuse remains in place.

Subscription webhook snapshots use `trial_start` and `trial_end` while status is `trialing`, so the account date and signed Pro deadline cannot extend into the later paid period. Active subscriptions use the actual paid item period. Zero-amount trial invoices have `fiscal_status=not_due` after `20261108010000_zero_amount_invoices.sql`; they do not queue a fiscal invoice. Both plans, including Pro trials, allow one active device per account.

Provider acceptance must verify card collection, no initial charge, one-time eligibility, cancellation before charging, automatic first payment after 30 days and the full 6- or 12-month period after that payment. This is pending real Stripe access. Live billing remains disabled until provider acceptance and both release flags are set.

Sources: [Stripe Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create), [Stripe trial behavior](https://docs.stripe.com/api/subscriptions/update).

## Configure a Stripe sandbox

Use a separate Stripe test environment and isolated staging Supabase project. The former staging database is now production and rejects test-mode billing. Production provisioning is documented in [production setup](production-setup.md). For an isolated sandbox:

1. Create product **Declaut Pro** and the two recurring RON prices above in the sandbox/test environment.
2. Configure a dedicated Customer Portal for updating the card, viewing payment documents and canceling at the end of the current period. Keep subscription plan changes disabled initially to avoid unsupported proration/credit invoices. Keep quantity changes disabled for this single-license product.
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

Keep provider keys server-side. Live checkout requires the pinned production identity, matching supplier CUI, valid Oblio configuration, a dedicated portal, and `FISCAL_LIVE_READY=true` plus `BILLING_LIVE_ENABLED=true`. Checkout also requires the current commercial agreement. Cancellation and reconciliation remain available when new sales are disabled.

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

## Oblio fiscal invoices

`billing_invoices` stores the Stripe invoice ID, customer owner, subscription, status, paid amount, currency and safe Stripe document URLs. Owner-only RLS allows users to read their own records, with all writes through the server. The table also reserves separate fields for fiscal issuance state, fiscal number and provider PDF URL.

A positive paid live RON invoice queues Oblio issuance; zero/unpaid invoices are `not_due`. Live webhook processing retrieves the authoritative invoice and buyer details, then issues with an invoice-scoped Oblio idempotency key and stable issue date. Successful issuance persists the fiscal number and safe provider URL. A failure remains retryable through Stripe and the authenticated daily cron. Test-mode events never issue real invoices.

The configured supplier is non-VAT-paying, CUI 26143268, series F, explicit VAT 0. VAT names are discovered from the account nomenclature. Missing Romanian buyer details and amounts differing from the invoice total require review. Oblio SPV auto-send must be configured and verified in the provider account; document creation does not prove ANAF acceptance. Follow the production guide for credentials, retries and acceptance. The account distinguishes Stripe payment documents from fiscal invoices.

## Verification already performed

- Signed fixture events use the real Stripe SDK signature verifier and dependency-injected handler factories; no payment-provider request is made.
- Tests cover all six event types, tampered bodies/signatures, duplicate and out-of-order events, slow concurrent fetches, ownership mismatch and unknown prices.
- Disposable PostgreSQL tests cover customer binding, concurrent checkout reservation, fencing, invoice uniqueness/fiscal-field preservation, RLS and denial of client access to server-only tables/functions.
- Browser tests against staging cover account plan/renewal display, paid-document/fiscal-pending presentation, one active device on Free and Pro, second-device rejection, device removal and disabled billing endpoints when no Stripe key is configured. Apply all migrations, through the single-device and zero-amount-invoice migrations, before running the updated tests.

References: [Stripe Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhook signature verification](https://docs.stripe.com/webhooks/signature), [Stripe API idempotency](https://docs.stripe.com/api/idempotent_requests), [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks).
