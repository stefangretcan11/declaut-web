# Track B staging handoff

This handoff describes **license-v1-proposed**. The backend implements it; Track B still needs to agree to the request/response fields, claims, refresh schedule and offline/device-removal behavior before shipping the desktop integration.

## Public configuration to consume

Use [track-b-public-config.json](track-b-public-config.json). It contains the real staging Supabase URL, a publishable/anon key validated before export, and the staging Ed25519 verification JWK. These values are intended for distribution with the desktop client.

| Setting | Staging value / source |
| --- | --- |
| Supabase URL | `https://jdvurtohbypdlvkirnrm.supabase.co` |
| Supabase publishable key | `supabasePublishableKey` in the public config JSON |
| Reference license API | `https://declaut-f7vs3twun-declaut.vercel.app/api/license` |
| Intended stable API origin | `https://declaut-web.vercel.app` — verify the latest deployment/domain assignment before switching |
| Signing algorithm | `EdDSA` with an Ed25519 key |
| Trusted staging `kid` | `staging-aff45a1685a6` |
| Expected issuer | `declaut-staging` |
| Expected audience | `declaut-desktop` |
| Token schema version | `v: 1` |
| Public verification keys | [license-public-keys.json](license-public-keys.json); pin the staging key for staging |

The reference deployment passed authenticated Free/Pro license tests on **2026-10-24**. That records a specific deployment, not a claim that the latest account/marketing/billing changes are already hosted there. The stable domain must pass the deployment check and authenticated smoke test after the current code is deployed. Do not send bearer tokens to a guessed or unrelated domain, and do not follow an API redirect to another origin.

The staging database remains in Ireland (`eu-west-1`); new Vercel deployments select Dublin (`dub1`). Production uses a separate Supabase project and the separately generated production public key/issuer when provisioned. Do not mix the environments.

## Account access during integration

Email confirmation is required. Sign-in works for a confirmed staging account. Owner-managed demo credentials are stored locally in ignored `.env.demo.local`; obtain access from the owner through an appropriate private channel rather than committing a password in Track B. Automated test accounts are deleted after testing and cannot be reused.

Custom SMTP is not configured yet, so actual signup-confirmation and reset-email delivery is pending. Website email-link flows have been tested against real Supabase one-time tokens generated without email delivery. This is enough to begin desktop session/license integration with the confirmed demo account.

## Password sign-in and session refresh

The desktop application talks to Supabase Auth directly with the **publishable key**. The website's HttpOnly browser cookies are not a desktop API contract.

Read the public config values into local variables. The placeholders below are not credentials:

```sh
curl --fail-with-body "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"email":"<confirmed-staging-email>","password":"<password>"}'
```

The response contains `access_token`, `refresh_token` and access-token lifetime metadata. Store the session in Windows credential storage. Never write passwords, refresh tokens or access tokens to logs.

When the access token expires, refresh the session:

```sh
curl --fail-with-body "$SUPABASE_URL/auth/v1/token?grant_type=refresh_token" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"refresh_token":"<current-refresh-token>"}'
```

Persist the newest returned session and serialize refresh attempts so two app tasks do not race with the same refresh token. A license JWT is a separate object and cannot be used to authenticate Supabase requests.

## Request a license

Generate a persistent installation ID once, preserve it across app updates, and send a readable device name. The caller cannot choose the user ID or plan.

```sh
curl --fail-with-body "$API_URL/api/license" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"device_id":"desktop-test-1","device_name":"Contabilitate PC"}'
```

Success is HTTP 200 with `token`, `plan`, `expires_at`, `device_limit_reached`, `latest_version` and `download_url`. Both release fields remain nullable during outages or when a channel has no eligible release; do not treat null release metadata as an invalid license.

Track B supplied [v0.9.0-rc1](https://github.com/mihaicostache1/declaut-release/releases/tag/v0.9.0-rc1), with the public asset `declaut-setup.exe`. GitHub marks it as a prerelease; no stable release was present when checked on 2026-10-24. The local staging configuration opts into the preview feed and resolves `latest_version=0.9.0-rc1` with that installer URL. Set `GITHUB_RELEASES_REPO=mihaicostache1/declaut-release`, `GITHUB_RELEASE_ASSET_NAME=declaut-setup.exe` and `GITHUB_RELEASE_CHANNEL=preview` on the staging Vercel project, then redeploy. The older hosted reference is not automatically updated by local configuration changes. Production keeps `GITHUB_RELEASE_CHANNEL=stable` and never opts into prereleases.

The complete validation rules, response example and error table are in [license-contract.md](license-contract.md).

## Verify before granting Pro

1. Read the JWT header and select a **trusted local key** by `kid`. Reject unknown keys; do not fetch a key from a URL supplied by the token.
2. Verify the signature with Ed25519 and explicitly permit only `EdDSA`.
3. Check issuer `declaut-staging`, audience `declaut-desktop`, schema `v === 1` and expiration.
4. Match `sub` to the signed-in Supabase user and `device_id` to the local installation ID.
5. Use the **verified token's** `plan`. The surrounding JSON is convenience metadata, not offline proof of entitlement.

Tokens last no more than 24 hours. Pro expires sooner when the known subscription period or past-due grace deadline is earlier. Refresh at startup/sign-in, approximately every six hours while online, and after account/device changes. Supabase access-token refresh remains separate.

Offline, keep using an unexpired verified license. After expiry, retain Free functionality and ask for an online refresh before restoring Pro. During a temporary HTTP 503, honor `Retry-After` with backoff and preserve any unexpired license.

## Subscription and device behavior

- `active` or `trialing` qualifies for Pro until the current period ends.
- `past_due` qualifies only before both `current_period_start + 72 hours` and the current period end.
- Other statuses produce Free. Scheduled cancellation preserves Pro until the period end.
- The two earliest registered devices receive Pro, ordered by registration time and internal ID. Registering a third device returns a **signed Free token** and `device_limit_reached: true`.
- Removing a device from the account page releases its slot for the next registered device on that device's next license request. The removed installation can register again if it calls the endpoint; removal is not a permanent installation ban.
- Previously issued tokens remain valid until their expiration. The desktop must refresh after online changes; a removed device cannot be instantly revoked while offline under this contract.

Without a Stripe account, the owner can insert a staging subscription fixture to test Pro. Fixture tests do not prove real checkout or webhook delivery. Approved planned Pro prices are **300 RON per six months** and **500 RON per year**; real Stripe prices are configured separately when the account is available.

## Integration acceptance

- [ ] Track B acknowledges the proposed v1 field names, claims, token lifetime and offline behavior.
- [ ] Sign in with the confirmed staging account and refresh its Supabase session.
- [ ] Verify a Free JWT using the supplied public key and reject a token for another user/device/audience.
- [ ] Verify Pro with a staging subscription; obtain Free plus the limit flag on a third installation.
- [ ] Remove one device from the account page and refresh the next device to observe slot promotion.
- [ ] Confirm an already-issued removed-device token is honored only until its existing expiration.
- [ ] Handle HTTP 401 by refreshing/signing in; handle HTTP 503 without discarding an unexpired license.
- [ ] Render null release metadata without hiding or breaking the current app.
- [ ] Run the same tests through the stable API domain after its deployment is verified.

Only public config and public verification keys belong in the desktop app. The Supabase service-role key, signing private key, SMTP credentials and Stripe secret/webhook keys stay on the server.

Sources for the underlying auth transport: [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Supabase Auth source/API](https://github.com/supabase/auth).
