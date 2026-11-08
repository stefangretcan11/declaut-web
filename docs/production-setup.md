# Lansarea producției Declaut

Stare verificată la **8 noiembrie 2026**: migrațiile sunt aplicate, iar buildul și testele locale trec. Acceptarea serviciilor externe este încă necesară; `desktopReleaseReady` rămâne `false`.

## Aplicat și configurat

- Domeniu: `https://www.declaut.ro`.
- Supabase: `jdvurtohbypdlvkirnrm`, Irlanda, promovat din staging în producție la cererea proprietarului. Nu mai folosiți proiectul pentru fixture-uri staging sau plăți Stripe test.
- Toate migrațiile până la `20261108020000_production_consent_and_fiscal.sql` sunt aplicate și înregistrate, inclusiv un dispozitiv per cont, facturi zero fără obligație fiscală, istoricul acordurilor și funcțiile Oblio.
- Supabase Auth folosește domeniul de producție și redirecturile exacte `/auth/callback`, `/auth/confirm`, `/reset-password`. Confirmarea emailului rămâne obligatorie.
- Operator: Costache Ionela-Daniela - Expert Contabil, CUI 26143268, Str. Brazda lui Novac nr. 41, bloc A13, etaj 1, apartament 5, Craiova, Dolj. Suport: costache.mihai1710@gmail.com. Oblio: seria F, neplătitor TVA, cotă explicită 0.
- Free: trei firme. Free și Pro: un dispozitiv activ per cont. Pro: un trial de 30 de zile cu card de la început, apoi 300 lei / șase luni sau 500 lei / 12 luni.

## Vercel și licențe

Testul autentificat al serverului public a eșuat la verificarea semnăturii. Cheia privată locală de producție corespunde JWK-ului distribuit desktopului; serverul public trebuie configurat cu aceeași identitate.

Configurația privată este în `.env.declaut-production.local`. Generați exportul:

```sh
npm run export:production
```

Importați local `.artifacts/vercel-production.env` în Vercel Production și publicați această versiune a codului. Fișierul conține secrete: nu îl puneți în Git sau în chat. Exportul include numai valorile disponibile, nu completează credențialele Stripe/Oblio lipsă și nu exportă tokenurile administrative ori parola SMTP. Verificați valorile deja existente pe Vercel înainte de înlocuire.

Vercel: Next.js, Node.js 24, `npm run build`, director rădăcină și output implicit; funcții în Dublin (`dub1`). Păstrați inițial `BILLING_LIVE_ENABLED=false` și `FISCAL_LIVE_READY=false`. Modificarea variabilelor necesită redeploy.

```sh
node scripts/check-deployment.mjs --url=https://www.declaut.ro
npm run test:production
```

Testul licenței creează și șterge un cont temporar și fixture-uri marcate. Nu încasează bani și nu trimite email. Serverul și desktopul trebuie să folosească issuer `declaut-production`, audience `declaut-desktop`, kid `production-656ad39d72c8` și JWK-ul din [configurația publică](track-b-production-config.json).

## Stripe

Accesul autentificat la Stripe nu este disponibil în checkout. Completați privat `STRIPE_SECRET_KEY` cu cheia live a contului autorizat; nu trimiteți cheia în chat.

```sh
npm run stripe:production
npm run stripe:production -- --apply
```

Prima comandă descrie planul fără cereri către provider. A doua creează/reutilizează produsul, prețurile exacte, portalul dedicat și webhook-ul. Scrie privat ID-urile și secretul noului webhook în configurația locală. Nu creează clienți, abonamente sau încasări. Pentru un webhook existent, păstrați secretul deja configurat; Stripe nu îl returnează din nou.

Sunt necesare `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SEMIANNUAL`, `STRIPE_PRICE_YEARLY`, `STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_WEBHOOK_SECRET`. Endpoint: `https://www.declaut.ro/api/stripe/webhook`, versiune `2026-09-30.endive`. Portalul permite actualizarea cardului, documentele și anularea la sfârșitul perioadei; schimbarea planului este dezactivată la lansare.

Verificați cardul obligatoriu, trialul fără încasare inițială, eligibilitatea unică, anularea, plata după 30 de zile și perioada completă de șase sau 12 luni. Cardurile de test și ceasurile accelerate se folosesc într-un mediu Stripe/Supabase izolat. Validarea live necesită un cont activ și o tranzacție reală autorizată; aceste scripturi nu au efectuat-o.

## Oblio

Completați privat `OBLIO_CLIENT_ID` și `OBLIO_CLIENT_SECRET`. Furnizorul este deja configurat cu CUI 26143268, seria F și TVA 0. Integrarea citește denumirea cotei din nomenclator; dacă mai multe cote zero nu au una implicită, completați `OBLIO_VAT_NAME` cu denumirea exactă.

Verificați seria F, autorizarea SPV și trimiterea automată e-Factura în contul Oblio. Crearea facturii nu dovedește acceptarea ANAF. Verificați factura, emailul, PDF-ul și starea SPV pe o plată autorizată; repetarea webhook-ului trebuie să păstreze un singur document. Codul folosește idempotency per factură Stripe și o dată de emitere stabilă.

Facturile cu credite/diferențe față de total și cumpărătorii fără date fiscale românești complete necesită verificare manuală. Cronul `/api/internal/fiscal/retry` reîncearcă zilnic până la două documente restante, autentificat cu `CRON_SECRET`; urmăriți restanțele în operare.

## Email și acceptare

Configurați un expeditor SMTP verificat în Supabase. Adresa Gmail de suport nu dovedește existența unui expeditor SMTP. Template-urile comerciale sunt pregătite în `supabase/templates/production-*.html`; aplicarea lor pe server nu este încă verificată.

Helperul cere un `SUPABASE_ACCESS_TOKEN` administrativ păstrat privat și păstrează implicit SMTP-ul existent:

```sh
npm run auth:production
npm run auth:production -- --apply
```

Pentru configurarea SMTP prin helper, completați privat `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` și adăugați `--smtp`. Testați confirmarea și resetarea într-o căsuță reală, inclusiv linkuri expirate/reutilizate. Numai apoi înregistrați local `SMTP_ACCEPTANCE_VERIFIED=true`.

```sh
npm run check:production -- --remote
npm run test:production
```

Raportul fără secrete este `.artifacts/production-readiness.json`. Configurația locală nu dovedește configurația deploymentului. După acceptarea providerilor activați explicit `FISCAL_LIVE_READY=true` și `BILLING_LIVE_ENABLED=true`, reexportați și redeployați. Portalul de anulare și reconcilierea abonamentelor existente funcționează independent de oprirea vânzărilor noi.

Marcați handoff-ul desktop ca verificat numai după acceptarea serverului, emailului și plăților. Apoi compilați valorile publice în installer și testați o instalare nouă. Vechile conturi staging trebuie să accepte termenii comerciali în `/account`; până atunci API-ul returnează `403 terms_acceptance_required` fără să ocupe un dispozitiv.

Surse tehnice: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [API Oblio](https://www.oblio.eu/api/), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Vercel environment variables](https://vercel.com/docs/environment-variables).
