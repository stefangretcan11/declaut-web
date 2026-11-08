# Production desktop release handoff

Status on **8 November 2026: blocked**. Production public signing material exists; the checkout has no production website URL, Supabase URL or publishable key. These are not values that can be inferred from staging. The local `.env.declaut-production.local` contains only the separately generated signing identity.

## Public configuration for the desktop developer

[track-b-production-config.json](track-b-production-config.json) is an **incomplete handoff**, with `desktopReleaseReady: false` and unknown values set to `null`. Do not copy it into a release's production block until provisioning and acceptance are complete.

| Desktop setting | Production value |
| --- | --- |
| Website / account / pricing origin | Pending production deployment and confirmed domain |
| License API origin | Pending production deployment; endpoint is `POST /api/license` |
| Supabase URL | Pending separate production project |
| Supabase publishable key | Pending that project's public key |
| License issuer | `declaut-production` |
| License audience | `declaut-desktop` |
| Signing algorithm | `EdDSA` / Ed25519 |
| Trusted `kid` | `production-656ad39d72c8` |
| Verification JWK | `license.publicKey` in the production config JSON; also in [license-public-keys.json](license-public-keys.json) |
| Free firm limit | **3**, matching the desktop's reported `FREE_MAX_FIRMS = 3` and this branch's signed `max_firms: 3` |
| Active devices per account, both plans | 1 after the single-device migration |
| First Pro activation | 30 free days with a card collected upfront, then the selected 6- or 12-month paid period |

The existing production JWK and `kid` were checked against the locally stored production signing private key on 8 November. That verifies the key pair; it does not prove that a server is deployed with it. Preserve this identity when configuring production. Server, signing, SMTP and Stripe secrets never belong in the desktop handoff.

The website uses **3**, rather than the original plan's 10. Keep 3 for this release to match the desktop; deploying this branch is still required before treating its policy as the hosted policy. Pro does not inherit Free's firm cap. See [the license contract](license-contract.md) for subscription deadlines, payment grace and offline behavior.

## Backend work before enabling accounts in an installer

1. Provision the separate production Supabase project in Ireland and production Vercel project. Configure their production public/server credentials and the existing production signing key, issuer, audience and `kid`. Set `SITE_URL` to the confirmed production website origin. Keep the staging project separate.
2. Apply **all** migrations, including [20261108000000_one_device_per_account.sql](../supabase/migrations/20261108000000_one_device_per_account.sql) and `20261108010000_zero_amount_invoices.sql`. Do not mark it applied before running it. On an existing linked project, inspect `supabase migration list`, then use `supabase db push` against the verified target. The latest device migration permits one active installation on both plans while preserving subscription eligibility, payment grace, device-bound tokens and inactive registration history. The invoice migration keeps zero-amount trial invoices out of fiscal issuance.
3. Deploy the branch containing the three-firm policy, `pro_until` signing and single-device migration. Verify `/login`, `/signup`, `/pricing`, `/account` and the license endpoint at the confirmed origin. Configure and test real confirmation and reset-email delivery.
4. Finish billing acceptance. Checkout, Portal and webhooks currently support **test mode only**; [billingReadiness](../src/lib/billing/config.ts) explicitly rejects live Stripe keys. Fiscal invoicing must be implemented and accepted before enabling live billing. Merely setting production Stripe secrets does not enable upgrades. Approved prices are 300 RON / six months and 500 RON / year.
5. Fill the public production handoff with the verified production origins and publishable key. Run the checks below, complete real email/payment acceptance, then record the verification date and set `desktopReleaseReady: true`.
6. Only then put the public values into the desktop's compiled production configuration and test a freshly installed executable.

The desktop handoff reports that frozen executables always use production configuration and currently quit if the startup login dialog is closed. Empty production settings leave accounts disabled. Given that behavior, keep the current account-disabled installer until production is accepted. Validate those desktop startup paths in the desktop repository; this checkout cannot change them.

## Verification

First run the unauthenticated deployment check with the exact production origin:

```sh
node scripts/check-deployment.mjs --url=https://YOUR-CONFIRMED-PRODUCTION-ORIGIN
```

Store the production Supabase URL, publishable key and server key alongside the existing signing settings in ignored `.env.declaut-production.local`. Complete the public production JSON, then run:

```sh
npm run test:production
```

The production command loads that separate environment file, checks its issuer, audience, key ID and Supabase settings against the pinned public handoff, and requires the production API origin. It refuses incomplete or mixed staging/production configuration before making requests. It does not require or print the signing private key. API requests do not follow redirects.

This test creates a temporary confirmed user and an explicitly marked Pro subscription fixture, checks Free's three-firm claim, one active device on Free and Pro, second-device rejection, device transfer, signed Pro/trial tokens and entitlement deadlines, payment grace, row access and invalid-token rejection, then deletes the user and its fixtures. It does not charge money, send confirmation emails or prove Stripe webhook delivery. Complete those separate acceptance checks before marking the handoff ready.

For staging, keep using `LICENSE_API_URL=https://declaut-web.vercel.app npm run test:staging`. On 8 November, the public deployment and read-only Supabase schema checks passed, as did a signed Free license with `max_firms: 3`. The database policy granted Pro to the first two test devices but failed on `smoke-three`. The single-device migration remains a hosted blocker. Temporary test accounts and fixtures were removed. No hosted migrations or deployments were changed during this verification.
