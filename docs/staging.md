# Staging setup and Track B handoff

## Record the manually applied migration

The initial SQL migration was applied in the Supabase SQL Editor and verified against the staging API. SQL Editor execution does not add it to the CLI migration history. Before pushing this migration to a GitHub branch with automatic Supabase deployment, record version `20261024000000` as applied so it will not try to create the tables again.

From this repository, use the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase migration repair 20261024000000 --status applied
npx supabase migration list
```

Find the project ref in Supabase project settings or the `<project-ref>.supabase.co` URL. The CLI may prompt for your project database password; enter it in your terminal. The database password is distinct from the service-role API key. Confirm the linked project is staging. Both local and remote columns in `migration list` should show `20261024000000`. This records history without rerunning the migration.

For a fresh production project later, apply the migration normally through the GitHub integration or `supabase db push`; do not mark it applied before actually applying it.

References: [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair), [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration).

## Deploy the staging application to Vercel

1. Commit and push the application after recording the staging migration history.
2. In Vercel, import the GitHub repository as a dedicated staging project, for example `declaut-staging`.
3. Select the Next.js framework, repository root, Node.js 24, and the normal `npm run build` command. Turn off the Output Directory override so Vercel uses the Next.js default. The repository's `vercel.json` explicitly selects Next.js and resets the output directory to its framework default. Deploy with the lockfile.
4. In the project's environment variables, copy these **values from the local staging `.env.local`**:

| Variable | Exposure |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public staging project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public staging key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret |
| `LICENSE_PRIVATE_KEY_BASE64` | Server signing secret; reuse the generated staging key |
| `LICENSE_KEY_ID` | Key ID from the generated environment file |
| `LICENSE_ISSUER` | `declaut-staging` |
| `LICENSE_AUDIENCE` | `declaut-desktop` |
| `GITHUB_RELEASES_REPO` | Optional `owner/repo` when Track B publishes |
| `GITHUB_RELEASE_ASSET_NAME` | Optional exact installer filename |

5. Use staging credentials for every deployment environment in this dedicated staging project. Vercel calls the main branch deployment “Production”; that label does not make it the Declaut production environment. Use a separate project and secrets for real production later.
6. Select a Frankfurt function region if supported by your plan, to keep the API close to Supabase.
7. Deploy or redeploy after changing environment variables.
8. Ensure Track B can reach `/api/license` without an interactive Vercel login. Configure deployment protection for this dedicated staging project as needed; the API itself still requires a Supabase bearer token. Do not embed a Vercel deployment-protection bypass secret in the desktop app.

References: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Verify the deployment

Run the existing staging smoke test against the deployed application:

```sh
LICENSE_API_URL=https://YOUR-STAGING-APP.vercel.app npm run test:staging
```

It uses the credentials in the local `.env.local`, creates temporary test fixtures, verifies JWT signatures against `.keys/staging/public.pem`, and cleans up. It proves Free/Pro issuance, two Pro devices, a third Free device, the 72-hour payment grace period, invalid-token rejection and server-only subscription writes. It bypasses email delivery by creating a confirmed test user through the admin API; custom SMTP and real signup confirmation still need separate setup and validation.

## Supabase auth settings

The read-only project check confirmed email confirmation is required. Before adding auth pages:

- Verify the project region is Frankfurt.
- Set the staging application's URL and the exact auth callback/reset redirect URLs in Supabase. The repository's `config.toml` contains local defaults; persistent GitHub-connected projects may not automatically apply auth settings.
- Configure custom SMTP and verify the sender domain. Test actual confirmation and reset emails when the auth pages are implemented.

## Hand off to Track B

Share:

- Staging Supabase URL and publishable key.
- Deployed API base URL and `POST /api/license`.
- `.keys/staging/public.pem` and the matching `LICENSE_KEY_ID`.
- Issuer `declaut-staging`, audience `declaut-desktop`, and [the proposed API contract](license-contract.md).
- A test account with a confirmed email, or instructions to create one once signup is available. The smoke test account is deleted and cannot be reused.

Do not share the Supabase server key or signing private key with the desktop app. Offline device-removal behavior and token expiry are described in the contract and need Track B agreement.
