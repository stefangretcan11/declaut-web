# Declaut website and backend

Next.js App Router and TypeScript on Vercel, with Supabase Auth/Postgres, Ed25519 license signing, Romanian public/account pages and Stripe billing and separate manual fiscal invoicing.

## Status — 9 November 2026

- Production is `https://www.declaut.ro`. At the owner's request, Supabase project `jdvurtohbypdlvkirnrm` was promoted from staging to production; its Ireland region is unchanged. All migrations through `20261108020000_production_consent_and_fiscal.sql` are applied and recorded, and production Auth redirects are configured.
- Free supports three firms. Free and Pro permit one active device per account; a second installation receives HTTP 409 without a license. Removal frees the active slot; offline tokens retain their original expiry.
- The first Pro subscription includes 30 free days with a card upfront, then the full selected 300 RON / six-month or 500 RON / 12-month paid period. Eligibility is checked from customer subscription history.
- Production code includes commercial consent history, operator/contact details, separate Free/Pro licenses and a matching pinned Ed25519 identity. Prior staging consent does not count as commercial consent.
- Stripe live checkout requires production configuration and the explicit `BILLING_LIVE_ENABLED` switch. The accountant issues fiscal invoices separately; webhook reconciliation records payments without calling a fiscal provider. The account explains manual invoicing and preserves historical fiscal documents. No Oblio credentials, fiscal release flag or invoice-retry cron are needed. Portal cancellation and reconciliation remain independent of the new-sales switch.
- Application, database and browser checks cover license/device policy, Stripe reconciliation, manual-invoicing presentation and production pages. Hosted public HTTP checks pass, and the latest saved authenticated production license acceptance is PASS.
- Launch still requires actual SMTP/Stripe acceptance, an agreed manual invoicing workflow and a fresh installed desktop test. No real payment or fiscal invoice has been created during this change.

Follow [the production setup guide](docs/production-setup.md). Private configuration and the Vercel import artifact are ignored by Git. `desktopReleaseReady` remains false until acceptance passes.

## Local development

Use Node.js 22 or later and npm.

```sh
npm ci
```

For staging development, use an isolated Supabase project and matching public handoff. The old `.env.local` points at the project now promoted to production; staging helpers intentionally reject it. Do not create staging/demo fixtures in the customer database. For production configuration use the separate ignored `.env.declaut-production.local` and the production setup guide.

For a new environment only, generate the signing key with `npm run keys:generate`. This writes an ignored private/public key pair and updates `.env.local`. It refuses to replace an existing key. For production, use `npm run keys:generate -- production`; this writes separate keys and `.env.declaut-production.local`. That file is deliberately outside Next.js's automatically loaded environment filenames so a staging build cannot accidentally use the production signing identity.

```sh
npm run dev
```

Open http://localhost:3000. The API uses the Node.js runtime. Keep `SUPABASE_SERVICE_ROLE_KEY` and `LICENSE_PRIVATE_KEY_BASE64` server-only; never prefix them with `NEXT_PUBLIC_`.

The old staging/demo credentials are historical. Create new demo accounts only after configuring an isolated staging environment. Use a real inbox you own for email-delivery acceptance.

## Verification

```sh
npm run typecheck
npm test
npm run test:database
npm run build
npm run test:auth
```

`test:database` requires PostgreSQL binaries (`initdb`, `pg_ctl`, `pg_config`) on your machine. Set `PG_BIN` to their directory if needed. It creates and removes a disposable local PostgreSQL cluster with minimal Supabase auth roles; it does not touch the configured Supabase project.

`test:auth` requires Google Chrome. It starts the local production build on port 3100 and tests auth/account/device behavior against staging plus responsive public pages. It removes temporary accounts/subscriptions/devices/payment records afterward. It uses admin-generated one-time tokens and does not verify inbox delivery. Screenshots are saved in ignored `.artifacts/`. Ordinary GitHub CI needs no hosted credentials; staging browser acceptance is an optional manual trusted-branch workflow.

Staging commands below require an isolated staging project. `npm run check:supabase` performs read-only credential, auth-setting and schema checks. To test the full endpoint, start `npm run start -- --hostname 127.0.0.1 --port 3100` after building, then run `npm run test:staging` in another terminal. That test creates a temporary confirmed account and subscription in the configured project, verifies license issuance and removes its fixtures. It does not verify email delivery.

## Integration and deployment

- [License API contract and curl example](docs/license-contract.md)
- [Staging deployment and Track B handoff](docs/staging.md)
- [Track B handoff and distributable public config](docs/track-b-handoff.md)
- [Production desktop release blockers and public configuration](docs/production-desktop-release.md)
- [CI, deployment checks and remaining launch inputs](docs/deployment-checklist.md)
- [Stripe and manual invoicing](docs/billing.md)
- [Current production setup and remaining acceptance](docs/production-setup.md)
- [Marketing content and missing launch assets](docs/marketing-content.md)
- [A1 accounts, production keys, SMTP and A3 acceptance checks](docs/accounts-and-email.md)
- [Frontend direction and Apple HIG references](docs/frontend.md)
- [Staging and production public verification keys](docs/license-public-keys.json)
- Database migration: `supabase/migrations/20261024000000_accounts_and_licenses.sql`
- Public verification key on this machine: `.keys/staging/public.pem`

The Supabase GitHub integration deploys Supabase resources. Vercel hosts the Next.js app separately. Commit migrations, application source, `.env.example` and `package-lock.json`; keep credentials and `.keys/` out of Git.
