# License API — proposed v1 contract

This is the initial Track A contract, implemented in this repository. Track B has not yet confirmed it. Agree on this document before releasing the desktop integration.

## Authentication

Use Supabase Auth with the staging project URL and publishable key. Email confirmation is required. The license API validates each access token through `supabase.auth.getUser(accessToken)` and requires a confirmed, non-anonymous email account.

Password sign-in:

```http
POST <SUPABASE_URL>/auth/v1/token?grant_type=password
apikey: <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json

{"email":"user@example.com","password":"<password>"}
```

Store the access and refresh tokens in the desktop platform's secure credential storage. Refresh sessions through Supabase Auth; a license JWT is not a Supabase access token.

The distributable staging URL, publishable key and verification JWK are available in [track-b-public-config.json](track-b-public-config.json), with usage and acceptance steps in [the Track B handoff](track-b-handoff.md). Its reference deployment was verified on the recorded date; verify the stable domain before switching the desktop integration.

## Request

```http
POST <API_URL>/api/license
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json

{"device_id":"4d51fb5c-1cac-4af6-9606-eb9f682037ba","device_name":"Contabilitate PC"}
```

`device_id` is a persistent identifier generated once per installation, 1–128 ASCII letters, digits, dots, underscores, colons or hyphens. Preserve it across app upgrades. `device_name` is a human-readable name of 1–120 characters with no control characters. The backend trims surrounding whitespace. Maximum body size is 4 KiB. Extra fields are rejected; identity and plan come from the server.

Equivalent curl (set the placeholder variables locally):

```sh
curl --fail-with-body "$API_URL/api/license" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"device_id":"desktop-test-1","device_name":"Test PC"}'
```

## Response

```json
{
  "token": "<compact-signed-JWT>",
  "plan": "pro",
  "expires_at": "2026-10-25T12:00:00.000Z",
  "latest_version": "1.2.3",
  "download_url": "https://github.com/OWNER/REPO/releases/download/v1.2.3/Declaut-Setup.exe"
}
```

`latest_version` and `download_url` are independently nullable until an eligible release with an unambiguous Windows installer is available. Production uses stable releases; staging can explicitly opt into preview releases, in which case versions can include suffixes such as `0.9.0-rc1`. Release outages do not block licensing. Responses have `Cache-Control: no-store`.

## Signed token

Header: `{"alg":"EdDSA","typ":"JWT","kid":"<environment-key-id>"}`. Keys use Ed25519. Public key files use SPKI PEM; private keys use PKCS#8 PEM.

```json
{
  "v": 1,
  "sub": "<Supabase-user-UUID>",
  "device_id": "4d51fb5c-1cac-4af6-9606-eb9f682037ba",
  "plan": "pro",
  "pro_until": "2027-04-24T12:00:00.000Z",
  "iss": "declaut-staging",
  "aud": "declaut-desktop",
  "iat": 1792843200,
  "exp": 1792929600
}
```

- Verify the signature, pin `EdDSA`, resolve the trusted public key by `kid`, check `iss`, `aud`, `exp`, `v`, and match `sub` and `device_id` to the signed-in user and local installation.
- Enforce the plan from the verified JWT. Other JSON fields are convenience metadata, not offline proof of entitlement.
- Free tokens include `max_firms: 3`, matching the desktop Free cap. Pro tokens retain their existing claims and do not inherit this Free cap.
- Pro tokens include `pro_until`, the known entitlement deadline as an ISO 8601 UTC string. It is the subscription period end, capped by the payment-grace deadline for `past_due` subscriptions, and may be later than `exp`. Free tokens omit it. Use this verified claim for the Cont panel's “Pro până la …” date; `exp` still governs token validity. Older tokens may lack the claim; omit the date until a refresh supplies it.
- Default maximum token lifetime is 24 hours. Pro tokens expire earlier at the known subscription end or payment-grace deadline.
- Suggested desktop refresh: on sign-in/startup, every six hours while online, and after billing/device changes. Supabase access tokens may expire sooner; refresh those separately.
- Offline: honor a valid license until `exp`; after expiry, keep Free functionality and require an online refresh for Pro.
- Staging issuer is `declaut-staging`; production will use `declaut-production` with an independent key pair. Audience is `declaut-desktop`.
- Rotation: distribute the next public key to Track B before signing with its new `kid`. Keep old verification keys until the last old token expires. The key-generation script refuses to overwrite an existing key.

## Plan and device rules

`active` and `trialing` qualify for Pro while the current period has not ended. `past_due` qualifies only before `current_period_start + 72 hours` and before `current_period_end`. All other statuses qualify for Free. `cancel_at_period_end=true` preserves Pro until the current period ends. The server ignores future periods until they start. When multiple eligible subscriptions exist, use the latest entitlement deadline.

| Rule | Limit |
| --- | --- |
| Firms on Free | 3 |
| Active devices per account, Free and Pro | 1 |

The website does not introduce a new firm limit for Pro. The first installation to request a license occupies the account's single active device slot, whether the account is Free, in its Pro trial or paying for Pro. Repeated requests from that installation renew its license. A second installation receives HTTP **409** with `{"error":{"code":"device_limit_reached"}}`; it receives no token and must not be treated as an ordinary Free license response.

Apply all migrations through `20261108000000_one_device_per_account.sql` before deploying the updated website. Earlier migrations remain in history. The new migration preserves existing registrations and marks only the oldest one (ordered by `created_at`, then row ID) active. Other legacy registrations remain visible as inactive. A partial unique index and the per-profile transaction lock enforce one active registration even during simultaneous requests. The RPC retains its `device_limit_reached` boolean and returns internal `plan=blocked` for a refused installation. The current server converts that result to HTTP 409 before signing. Older server versions reject the unknown plan and issue no fallback Free token during the migration/deployment window. Successful HTTP responses omit that flag.

To switch PCs, remove the active device from `/account`, then request a license on the new PC. Removal and registration share the per-profile lock. Inactive legacy devices are not automatically promoted after removal; the next successful request claims the free slot. A removed PC can register again only while the slot is free. Subscription status, payment grace and owner-only row access are unchanged.

Previously issued JWTs remain usable until expiry, at most 24 hours. Removing a device does not instantly revoke an offline token. Desktop integration must handle the new 409 as blocked activation, direct the user to account device management and stop using a license for online activation once the server reports the conflict. This repository cannot enforce that desktop behavior by itself.

Pro's first activation includes a one-time **30-day free trial**, with a card collected at Checkout. After the trial, the selected recurring period starts: 300 RON / six months or 500 RON / twelve months. During `trialing`, the signed Pro deadline is the verified Stripe `trial_end`; it must not use a later paid billing-period end. Returning customers with any previous Stripe subscription, including a canceled trial, do not receive another trial.

## Release metadata

Set `GITHUB_RELEASES_REPO=mihaicostache1/declaut-release` and `GITHUB_RELEASE_ASSET_NAME=declaut-setup.exe`. By default, read GitHub's latest stable release. Staging may opt into `GITHUB_RELEASE_CHANNEL=preview`, selecting the newest published non-draft entry from the latest 30 releases, including prereleases but excluding tags containing `-pro` (case-insensitive). The option is honored only when the issuer is `declaut-staging`; production always uses the stable feed. Strip a leading `v` before a numeric version and preserve prerelease suffixes. Only credential-free HTTPS download URLs under the configured GitHub repository are accepted.

Successful results are cached for one hour with Next.js fetch caching and an instance cache. Failed refreshes reuse the instance's last success when available, otherwise return null metadata; retries are throttled to one minute. A cold server instance may have no fallback.

## Errors

```json
{"error":{"code":"unauthorized"}}
```

| HTTP | Code | Desktop behavior |
| --- | --- | --- |
| 400 | `invalid_request` | Correct the request; do not retry unchanged. |
| 401 | `unauthorized` | Refresh the Supabase session or ask the user to sign in. |
| 409 | `device_limit_reached` | Block activation; remove the active PC from the account before switching. |
| 403 | `email_confirmation_required` | Ask the user to confirm their email. |
| 403 | `terms_acceptance_required` | Open `https://www.declaut.ro/account` for commercial terms acceptance, then retry. No device slot is reserved. |
| 413 | `request_too_large` | Send a smaller request. |
| 415 | `unsupported_media_type` | Send JSON with `Content-Type: application/json`. |
| 503 | `auth_unavailable`, `database_unavailable`, `license_unavailable` | Retry with backoff; honor `Retry-After`. Preserve an existing unexpired license. |
