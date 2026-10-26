# Romanian public pages

The site uses the existing warm off-white/dark-green design, system typography, generous spacing, keyboard focus, native disclosure controls and responsive layouts. Marketing styles are scoped under `.marketing-site` in `src/app/marketing.css`; the authentication styling is preserved.

## Routes

| Route | Content |
| --- | --- |
| `/` | Product introduction, three clearly labelled illustrative workflow previews and account CTA |
| `/preturi` | Free/Pro comparison and owner-supplied Pro pricing |
| `/descarcare` | Windows 10/11 availability, latest release/installer when configured, honest unavailable state otherwise |
| `/intrebari-frecvente` | Account, app, license, device and offline questions |
| `/contact` | Real configured email or an explicit not-yet-published state, plus useful account/download links |

`/pricing`, `/download` and `/faq` permanently redirect to their Romanian canonical routes.

## Owner-supplied configuration

- `NEXT_PUBLIC_PRO_SEMIANNUAL_PRICE_RON`: optional display override; defaults to the owner's approved **300 RON / six months**.
- `NEXT_PUBLIC_PRO_YEARLY_PRICE_RON`: optional display override; defaults to the owner's approved **500 RON / year**.
- `CONTACT_EMAIL`: publish a real support address here. Until supplied, no invented email or nonfunctional contact form appears.
- `COMPANY_LEGAL_NAME`, `COMPANY_CUI`, `COMPANY_REGISTRATION_NUMBER`, `COMPANY_ADDRESS`: only provided operator fields appear in the footer. Missing values are not replaced with fictitious details.
- `GITHUB_RELEASES_REPO` and optionally `GITHUB_RELEASE_ASSET_NAME`: the existing release reader supplies the actual installer URL. No fake installer link is used.
- Track B's configured repository is `mihaicostache1/declaut-release`, installer `declaut-setup.exe`. Its first verified release is `v0.9.0-rc1`, marked prerelease. Staging explicitly uses `GITHUB_RELEASE_CHANNEL=preview`; the download page labels the test channel. Production stays stable-only.

The pricing CTA takes visitors to their account, where actual billing readiness is determined. Prices on the marketing page do not enable payments. The configured Stripe prices must match the approved RON amounts and six-month/yearly intervals before checkout is enabled.

Free permits up to three firms. Pro has no per-account device cap, and each license remains bound to its requesting PC. Pricing, FAQ and account copy reflect this policy; apply `20261026000000_remove_device_limit.sql` before deploying it. This update does not change Pro's firm-limit claims.

## Content still required before launch

- Real desktop screenshots from Track B. Current code-native previews are expressly labelled illustrative and use fictional data; they are not presented as shipped product screenshots or real ANAF responses.
- A stable Windows release before commercial launch. The current public `v0.9.0-rc1` installer is available for staging testing.
- The final desktop feature allocation between Free and Pro; the current comparison lists only confirmed license/device/subscription differences.
- The operator's company details and contact address. Legal pages are handled separately.
- Final tax treatment and commercial pricing copy before live billing. The page does not make an unverified VAT-inclusive/exclusive claim.

No testimonials, customer counts, unsupported performance claims or invented company information are included. The site does not add analytics or marketing cookies.

## Consumer-information links

The footer links directly to official ANPC and its active SAL portal: `https://anpc.ro/` and `https://reclamatiisal.anpc.ro/`. These are neutral information links, not claims of certification or endorsement.

The government's [Ordin 270/2026](https://legislatie.just.ro/Public/DetaliiDocument/310590), published on 19 May 2026, updates the SAL information pictogram to 250×50 pixels and the current SAL portal destination. The [consolidated original order](https://legislatie.just.ro/Public/DetaliiDocument/257649) reflects that update. The official ANPC artwork still needs to be retrieved and checked before commercial launch; the ANPC SAL/download page timed out during implementation, so no unofficial or recreated badge was added.

The former EU SOL/ODR link is intentionally absent: the [European Commission confirms that the platform closed on 20 July 2025](https://consumer-redress.ec.europa.eu/site-relocation_en). Verify the current consumer-information requirements and actual operator details as part of the commercial legal launch work; neutral links alone do not represent a completed legal review.
