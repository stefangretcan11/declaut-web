# Declaut website and backend

Next.js App Router and TypeScript, prepared for Vercel, with Supabase Auth/Postgres and Ed25519 license signing. Stripe integration follows this first milestone.

## Status

- Next.js application builds successfully; the home page is a Romanian development placeholder.
- `POST /api/license` validates Supabase access tokens, requires confirmed email, registers devices, resolves Free/Pro entitlements and signs licenses with `jose`.
- The database migration includes signup profiles, subscriptions, devices, read-only owner RLS and server-only writes. Device allocation is atomic per account.
- The migration was applied to the owner's staging Supabase project through the SQL Editor. A real staging test verified REST login, Free/Pro signatures, the two-device limit, past-due grace, and access restrictions; temporary test data was removed.
- The staging Ed25519 key pair was generated locally. `.env.local` and `.keys/` are ignored by Git.
- TypeScript, the production build, eight application tests and six PostgreSQL integration tests pass.

**Before the first GitHub database deployment:** mark the manually applied migration as applied in Supabase's migration history. Follow [the staging guide](docs/staging.md#record-the-manually-applied-migration). Do not run the same SQL twice.

The API is verified locally against staging Supabase. No Vercel deployment has been made yet. The API contract is proposed until Track B agrees to it; release metadata stays null until the public releases repository is configured. Auth pages, Stripe billing, account management, fiscal invoices, SMTP setup and full marketing/legal pages remain to be implemented. Frankfurt region selection has not been independently verified.

## Local development

Use Node.js 22 or later and npm.

```sh
npm ci
```

For a new checkout, copy `.env.example` to `.env.local` and fill in the staging Supabase URL, publishable key and server key. On the existing checkout, preserve the configured `.env.local`.

For a new environment only, generate the signing key with `npm run keys:generate`. This writes an ignored private/public key pair and updates `.env.local`. It refuses to replace an existing key. For production, use `npm run keys:generate -- production`; this writes separate keys and `.env.production.local`.

```sh
npm run dev
```

Open http://localhost:3000. The API uses the Node.js runtime. Keep `SUPABASE_SERVICE_ROLE_KEY` and `LICENSE_PRIVATE_KEY_BASE64` server-only; never prefix them with `NEXT_PUBLIC_`.

## Verification

```sh
npm run typecheck
npm test
npm run test:database
npm run build
```

`test:database` requires PostgreSQL binaries (`initdb`, `pg_ctl`, `pg_config`) on your machine. Set `PG_BIN` to their directory if needed. It creates and removes a disposable local PostgreSQL cluster with minimal Supabase auth roles; it does not touch the configured Supabase project.

`npm run check:supabase` performs read-only credential, auth-setting and schema checks. To test the full endpoint, start `npm run start -- --hostname 127.0.0.1 --port 3100` after building, then run `npm run test:staging` in another terminal. That test creates a temporary confirmed account and subscription in the configured project, verifies license issuance and removes its fixtures. It does not verify email delivery.

## Integration and deployment

- [License API contract and curl example](docs/license-contract.md)
- [Staging deployment and Track B handoff](docs/staging.md)
- Database migration: `supabase/migrations/20261024000000_accounts_and_licenses.sql`
- Public verification key on this machine: `.keys/staging/public.pem`

The Supabase GitHub integration deploys Supabase resources. Vercel hosts the Next.js app separately. Commit migrations, application source, `.env.example` and `package-lock.json`; keep credentials and `.keys/` out of Git.
