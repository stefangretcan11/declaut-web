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
  "device_limit_reached": false,
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
  "iss": "declaut-staging",
  "aud": "declaut-desktop",
  "iat": 1792843200,
  "exp": 1792929600
}
```

- Verify the signature, pin `EdDSA`, resolve the trusted public key by `kid`, check `iss`, `aud`, `exp`, `v`, and match `sub` and `device_id` to the signed-in user and local installation.
- Enforce the plan from the verified JWT. Other JSON fields are convenience metadata, not offline proof of entitlement.
- Default maximum token lifetime is 24 hours. Pro tokens expire earlier at the known subscription end or payment-grace deadline.
- Suggested desktop refresh: on sign-in/startup, every six hours while online, and after billing/device changes. Supabase access tokens may expire sooner; refresh those separately.
- Offline: honor a valid license until `exp`; after expiry, keep Free functionality and require an online refresh for Pro.
- Staging issuer is `declaut-staging`; production will use `declaut-production` with an independent key pair. Audience is `declaut-desktop`.
- Rotation: distribute the next public key to Track B before signing with its new `kid`. Keep old verification keys until the last old token expires. The key-generation script refuses to overwrite an existing key.

## Plan and device rules

`active` and `trialing` qualify for Pro while the current period has not ended. `past_due` qualifies only before `current_period_start + 72 hours` and before `current_period_end`. All other statuses qualify for Free. `cancel_at_period_end=true` preserves Pro until the current period ends. The server ignores future periods until they start. When multiple eligible subscriptions exist, use the latest entitlement deadline.

The first two registered devices, ordered by `created_at` then internal `id`, receive Pro. This includes devices registered while the account was Free. Device registration, plan resolution and allocation run in one transaction, locked per profile. Updating `last_seen_at` does not change slot priority. A third device receives a signed Free token with `device_limit_reached=true`; a Free account has this flag set to false. Slots do not expire from inactivity. Removing a device promotes the next registered device on its next refresh.

An issued JWT remains usable until expiry. Device removal or an immediate subscription change does not revoke an offline token. Removing and registering devices can therefore temporarily leave more than two unexpired Pro tokens; strict real-time revocation would require a different online-validation contract.

Account-page removal releases a registration slot; it is not a permanent installation ban. A removed installation can register again when it next calls `/api/license`. The desktop should refresh after online account changes while keeping the documented expiration boundary for offline operation.

## Release metadata

Set `GITHUB_RELEASES_REPO=mihaicostache1/declaut-release` and `GITHUB_RELEASE_ASSET_NAME=declaut-setup.exe`. By default, read GitHub's latest stable release. Staging may opt into `GITHUB_RELEASE_CHANNEL=preview`, selecting the newest published non-draft entry from the latest 30 releases, including prereleases. The option is honored only when the issuer is `declaut-staging`; production always uses the stable feed. Strip a leading `v` before a numeric version and preserve prerelease suffixes. Only credential-free HTTPS download URLs under the configured GitHub repository are accepted.

Successful results are cached for one hour with Next.js fetch caching and an instance cache. Failed refreshes reuse the instance's last success when available, otherwise return null metadata; retries are throttled to one minute. A cold server instance may have no fallback.

## Errors

```json
{"error":{"code":"unauthorized"}}
```

| HTTP | Code | Desktop behavior |
| --- | --- | --- |
| 400 | `invalid_request` | Correct the request; do not retry unchanged. |
| 401 | `unauthorized` | Refresh the Supabase session or ask the user to sign in. |
| 403 | `email_confirmation_required` | Ask the user to confirm their email. |
| 413 | `request_too_large` | Send a smaller request. |
| 415 | `unsupported_media_type` | Send JSON with `Content-Type: application/json`. |
| 503 | `auth_unavailable`, `database_unavailable`, `license_unavailable` | Retry with backoff; honor `Retry-After`. Preserve an existing unexpired license. |
