# Production desktop release handoff

Status on **8 November 2026: acceptance pending**. The owner selected `https://www.declaut.ro` and promoted the existing Ireland Supabase project to production. All migrations through `20261108020000_production_consent_and_fiscal.sql` are applied and recorded. Production Auth redirects are configured. Follow [the production setup guide](production-setup.md) for deployment/provider work.

## Public configuration

[track-b-production-config.json](track-b-production-config.json) contains the public values to compile into the desktop production block once acceptance passes. `desktopReleaseReady` remains `false` and `verifiedOn` remains `null`.

| Desktop setting | Production value |
| --- | --- |
| Website and API origin | `https://www.declaut.ro` |
| Supabase URL | `https://jdvurtohbypdlvkirnrm.supabase.co` |
| Supabase publishable key | `supabasePublishableKey` in the public JSON |
| License issuer / audience | `declaut-production` / `declaut-desktop` |
| Signing algorithm / key ID | Ed25519 (`EdDSA`) / `production-656ad39d72c8` |
| Verification JWK | `license.publicKey` in the public JSON |
| Free firm limit | 3 |
| Active devices, Free and Pro | 1 per account |
| First Pro activation | 30 free days, card upfront, then 300 RON / six months or 500 RON / 12 months |

The local production private key matches the public JWK. The authenticated test of the currently hosted API **failed signature verification**: deploy the matching production signer and this code before enabling accounts in an installer. Public HTTP and remote schema checks passed; they do not prove correct license signing.

The former staging project is now production. Old staging URLs/configuration are historical; provision an isolated staging project before further staging fixtures.

## Desktop behavior to verify

Follow [the API contract](license-contract.md). A second active installation gets HTTP 409 `device_limit_reached` with no token. Direct users to `/account` to remove the active installation. Previously issued offline tokens remain valid until their existing expiration.

Production requires commercial terms version `2026-11-08`. Existing staging accounts receive HTTP 403 `terms_acceptance_required` until acceptance in `/account`; no device slot is reserved. Open the account page and retry afterward. Handle this separately from email confirmation.

The reported desktop startup uses production settings in frozen executables and exits if the login dialog is closed. This repository cannot change those paths. Keep the account-disabled installer until the hosted signer, email, billing and fiscal acceptance pass, then test a fresh installed executable.

## Acceptance

```sh
node scripts/check-deployment.mjs --url=https://www.declaut.ro
npm run test:production
npm run check:production -- --remote
```

The license test creates a temporary confirmed account and marked subscription fixtures, verifies Free/Pro/trial signatures, device transfer and payment grace, and removes its fixtures. It neither charges money nor sends email. SMTP, Stripe and Oblio acceptance are separate.

Only public config and verification keys belong in the desktop app. Keep server, signing and provider secrets on the server.
