# A1 accounts, environments and auth email

## Current state — 2026-10-24

| Item | State |
| --- | --- |
| Existing staging Supabase | Working; project ref `jdvurtohbypdlvkirnrm`, region `eu-west-1` (Ireland). Owner chose to keep Ireland. |
| Staging migrations | Initial schema, signup consent, billing storage and device removal (`20261024000000` through `20261024030000`) are recorded and applied. |
| Hosted auth settings | Stable site URL, exact callback URLs, 12-character password minimum and required email confirmation applied through the existing CLI login. |
| Vercel application | Existing project and verified license deployment. Owner identified `https://declaut-web.vercel.app` as the stable domain to use. New account/marketing/auth/billing code still needs deployment to that domain. |
| Staging signing key | Generated, tested, private material ignored by Git. |
| Production signing key | Generated separately; private material in ignored `.keys/production/` and `.env.declaut-production.local`. |
| Public key handoff | Both keys are exported in `docs/license-public-keys.json`. |
| Region plan | Keep staging in Ireland, create future production in Ireland, and deploy Vercel backend functions to Dublin (`dub1`). |
| Custom domain | Not owned yet. The Vercel domain is sufficient for the staging website but cannot be used to verify a custom email sender. |
| Custom SMTP | Pending domain ownership and an email-provider account. Supabase blocks the prepared custom templates until SMTP is configured on this free project. |
| Stripe account | Pending owner signup. Checkout/portal/webhook code and fixture tests are implemented; actual sandbox acceptance is pending. Live payments remain disabled until fiscal invoicing is implemented. |

## Set up the email account

The prepared path uses Resend. Supabase also supports providers such as Postmark.

1. Choose and register the Declaut domain in an account you control. Keep DNS ownership with the business/project owner.
2. Create a [Resend account](https://resend.com/signup).
3. Add a sending domain or subdomain, for example `auth.YOUR-DOMAIN`. Add the exact DNS records Resend displays at your DNS provider and wait for verification. Do not replace the domain's unrelated mail records.
4. Create a sending API key for that domain and keep it in your password manager. Enter it directly in Supabase's SMTP password field.
5. In Supabase → Authentication → Email / SMTP settings, enable custom SMTP:

| Setting | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (TLS) |
| Username | `resend` |
| Password | The Resend API key |
| Sender email | An address on the verified sending domain, such as `cont@auth.YOUR-DOMAIN` |
| Sender name | `Declaut` |

6. Disable email click tracking/link rewriting at the provider if enabled. Verify that email links preserve `token_hash` and `type` query parameters.
7. Test real confirmation and reset emails to an inbox you own. Keep email confirmation required. The built-in Supabase sender is limited to authorized team addresses and is not a substitute for this setup.

Sources: [Resend SMTP settings](https://resend.com/docs/send-with-smtp), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Configure site URL and Romanian email templates

The auth configuration helper uses the existing Supabase CLI login and only declares the relevant auth fields. It never copies an SMTP password into its temporary files.

Preview the plan, then apply it:

```sh
npm run auth:configure -- --site-url=https://declaut-web.vercel.app --settings-only
npm run auth:configure -- --site-url=https://declaut-web.vercel.app --settings-only --apply
```

Supabase rejected template modifications on this free project while it uses the default sender. After enabling custom SMTP, preview and apply the complete plan:

```sh
npm run auth:configure -- --site-url=https://declaut-web.vercel.app
npm run auth:configure -- --site-url=https://declaut-web.vercel.app --apply
```

It configures:

- Site URL `https://declaut-web.vercel.app`.
- Exact callback URLs for that origin and local development.
- A 12-character minimum password, required email confirmation and secure email-change confirmation.
- Romanian confirmation and reset templates from `supabase/templates/`.

The templates use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` or `type=recovery`. The landing page asks the person to continue before consuming the one-time token, so a simple email-scanner GET does not consume it. The PKCE `/auth/callback` endpoint is also implemented.

Set `SITE_URL=https://declaut-web.vercel.app` in the dedicated staging Vercel project's Preview and Production environment scopes. Use staging Supabase and signing credentials in both scopes. Deploy the auth code to the stable domain; emails should not point at an old deployment-specific URL.

After deployment, check the actual stable domain, not only a preview URL. If it still displays Vercel's 404, ensure the branch with the app is promoted/assigned to that domain. At the beginning of this task the app code was on `feat/staging-license-api`, while `main` had only the initial README.

Sources: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Create the Stripe account

1. Create the account at [Stripe](https://dashboard.stripe.com/register) using the owner's real account details.
2. Use a sandbox or test environment, and keep any API keys in an ignored local file/password manager. Do not enable live checkout yet.
3. Follow [the billing setup guide](billing.md) to create Declaut Pro with the approved 300 RON / six-month and 500 RON / yearly recurring prices, then configure the existing checkout/portal/webhook integration. A6 handles fiscal invoices before live payments.

Source: [Stripe testing and sandboxes](https://docs.stripe.com/testing).

## Production setup in Ireland

1. Keep the existing staging project. No region migration or replacement staging project is needed.
2. Before creating the separate `declaut-production` Supabase project, check the organization's project quota and billing. Choose **West EU (Ireland) / `eu-west-1`** when creating it.
3. Connect production to the intended repository/branch workflow and apply all committed migrations normally. Do not mark an unapplied migration as applied.
4. Configure confirmation requirements, SMTP, templates and exact site/callback URLs separately for staging and production. Production should use the final commercial terms/version rather than the current staging agreement.
5. Keep a separate production Vercel project and secrets. Production uses the generated production key/issuer and its own Supabase project. `.env.declaut-production.local` is a secret source for that setup, not a file to load into staging.
6. Deploy backend functions to Dublin (`dub1`) alongside the Ireland database; this is declared in `vercel.json` and takes effect when deployed. Verify Free/Pro tokens, device allocation, grace periods, row access and email/password flows in each environment.
7. Hand Track B the current staging URL, publishable key, verified API URL and public signing key. Production uses its separate credentials when ready for launch.

## A3 acceptance checks

Automated checks cover server validation and CSRF/origin checks, consent timestamps, unconfirmed-login rejection, one-time confirmation, HttpOnly cookie login, logout, recovery/password change and REST sign-in/license verification. Browser tests use real Supabase tokens generated by the admin API without sending email, and delete the temporary account afterward.

Complete the remaining delivery check after SMTP is configured:

1. Create a fresh account through `/signup` with a real inbox you own, company name, CUI and acceptance of the staging terms.
2. Confirm that login is rejected before email confirmation.
3. Open the confirmation email, continue, then verify browser and desktop REST sign-in.
4. Request a reset through `/forgot-password`, open the email, change the password, and verify the old password fails and the new one signs in.
5. Verify expired/reused links prompt for a fresh email.

The staging terms/privacy notes describe the test environment. Final commercial terms, the operator's company details, GDPR disclosures and ANPC requirements remain part of A8.
