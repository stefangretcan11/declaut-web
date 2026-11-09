# Lansarea producției Declaut

Stare la **9 noiembrie 2026**: facturarea este manuală, gestionată de contabilul firmei. Migrațiile sunt aplicate, iar ultimul rezultat salvat al testului autentificat de licență este PASS pentru domeniul de producție. Acceptarea emailurilor, plăților și installerului rămâne separată; `desktopReleaseReady` rămâne `false`.

## Aplicat și configurat

- Domeniu: `https://www.declaut.ro`.
- Supabase: `jdvurtohbypdlvkirnrm`, Irlanda, promovat din staging în producție la cererea proprietarului. Nu mai folosiți proiectul pentru fixture-uri staging sau plăți Stripe test.
- Toate migrațiile până la `20261108020000_production_consent_and_fiscal.sql` sunt aplicate și înregistrate, inclusiv un dispozitiv per cont, documente de trial cu valoare zero și istoricul acordurilor. Funcțiile vechi de facturare rămân în istoricul bazei, dar aplicația nu le mai apelează.
- Supabase Auth folosește domeniul de producție și redirecturile exacte `/auth/callback`, `/auth/confirm`, `/reset-password`. Confirmarea emailului rămâne obligatorie.
- Operator: Costache Ionela-Daniela - Expert Contabil, CUI 26143268, Str. Brazda lui Novac nr. 41, bloc A13, etaj 1, apartament 5, Craiova, Dolj. Suport: costache.mihai1710@gmail.com. Facturile sunt emise separat de contabil, conform datelor firmei.
- Free: trei firme. Free și Pro: un dispozitiv activ per cont. Pro: un trial de 30 de zile cu card de la început, apoi 300 lei / șase luni sau 500 lei / 12 luni.

## Vercel și licențe

Ultimul test autentificat salvat pentru `https://www.declaut.ro` a trecut verificările de semnătură și licențiere. Cheia privată locală corespunde JWK-ului distribuit desktopului; păstrați aceeași identitate la redeploy.

Configurația privată este în `.env.declaut-production.local`. Generați exportul:

```sh
npm run export:production
```

Importați local `.artifacts/vercel-production.env` în Vercel Production și publicați această versiune a codului. Fișierul conține secrete: nu îl puneți în Git sau în chat. Exportul include numai valorile disponibile, nu completează credențialele Stripe lipsă și nu exportă tokenurile administrative ori parola SMTP. Verificați valorile deja existente pe Vercel înainte de înlocuire.

Vercel: Next.js, Node.js 24, `npm run build`, director rădăcină și output implicit; funcții în Dublin (`dub1`). Păstrați inițial `BILLING_LIVE_ENABLED=false`. Oblio și `FISCAL_LIVE_READY` nu mai sunt necesare. Modificarea variabilelor necesită redeploy.

Dacă buildul raportează `SITE_URL`, în câmpul Value din Vercel introduceți exact `https://www.declaut.ro`, fără ghilimele și fără prefixul `SITE_URL=`. Domeniul simplu `www.declaut.ro` nu este un URL complet. Un slash final este acceptat de validatorul actual. Verificați mediul deploymentului care a eșuat: o valoare salvată pentru Production nu se aplică unui deployment Preview. După salvare porniți un deployment nou; logul unui build anterior rămâne neschimbat.

```sh
node scripts/check-deployment.mjs --url=https://www.declaut.ro
npm run test:production
```

Testul licenței creează și șterge un cont temporar și fixture-uri marcate. Nu încasează bani și nu trimite email. Serverul și desktopul trebuie să folosească issuer `declaut-production`, audience `declaut-desktop`, kid `production-656ad39d72c8` și JWK-ul din [configurația publică](track-b-production-config.json).

## Stripe

Proprietarul a configurat Stripe Live în Vercel. Configurația locală este separată: pentru verificările prin CLI, completați privat valorile Stripe corespunzătoare în `.env.declaut-production.local`. Nu trimiteți chei în chat. Dacă produsul, prețurile, portalul și webhook-ul sunt deja configurate, păstrați ID-urile existente; nu este necesar să rulați din nou provisioningul de mai jos.

```sh
npm run stripe:production
npm run stripe:production -- --apply
```

Prima comandă descrie planul fără cereri către provider. A doua creează/reutilizează produsul, prețurile exacte, portalul dedicat și webhook-ul. Scrie privat ID-urile și secretul noului webhook în configurația locală. Nu creează clienți, abonamente sau încasări. Pentru un webhook existent, păstrați secretul deja configurat; Stripe nu îl returnează din nou.

Sunt necesare `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SEMIANNUAL`, `STRIPE_PRICE_YEARLY`, `STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_WEBHOOK_SECRET`. Endpoint: `https://www.declaut.ro/api/stripe/webhook`, versiune `2026-09-30.endive`. Portalul permite actualizarea cardului, documentele și anularea la sfârșitul perioadei; schimbarea planului este dezactivată la lansare.

`STRIPE_SECRET_KEY` acceptă atât `sk_live_…`, cât și cheia restricționată `rk_live_…`, cu permisiunile necesare operațiilor de billing. Ambele sunt chei private de server. Copiați secretul destinației webhook (`whsec_…`) în `STRIPE_WEBHOOK_SECRET` pentru Vercel Production; acesta este distinct de cheia API. După modificarea variabilelor sau publicarea suportului pentru chei restricționate, efectuați un deployment nou. Permisiunile necesare sunt descrise în [documentația billing](billing.md).

Verificați cardul obligatoriu, trialul fără încasare inițială, eligibilitatea unică, anularea, plata după 30 de zile și perioada completă de șase sau 12 luni. Cardurile de test și ceasurile accelerate se folosesc într-un mediu Stripe/Supabase izolat. Validarea live necesită un cont activ și o tranzacție reală autorizată; aceste scripturi nu au efectuat-o.

## Facturare manuală

Contabilul firmei urmărește încasările Stripe, emite facturile în sistemul propriu și le comunică separat clienților. Stabiliți accesul contabilului la documentele și datele de facturare necesare. Aplicația păstrează încasările și abonamentele, dar nu emite facturi, nu transmite în SPV și nu marchează automat facturile manuale ca emise.

Webhook-ul verifică semnătura și modul Live, citește starea Stripe și salvează plata înainte de a marca evenimentul procesat. Repetarea unui eveniment nu dublează înregistrarea. O eroare a bazei rămâne retryabilă; emiterea unei facturi nu condiționează salvarea plății sau licența Pro.

Contul clientului arată istoricul Stripe și explică facturarea manuală. Documentele fiscale istorice, dacă au număr și link salvate, rămân vizibile. Documentele cu valoare zero nu sunt afișate ca facturi fiscale în curs de emitere.

Nu mai sunt folosite `OBLIO_*`, `FISCAL_LIVE_READY` sau `CRON_SECRET`. După deploy le puteți elimina din Vercel dacă nu sunt folosite de alte aplicații. Endpointul `/api/internal/fiscal/retry` și cronul de emitere sunt eliminate. Exportul de configurare nu mai include aceste variabile.

Nu este necesară o migrație nouă. Coloanele și funcțiile fiscale istorice sunt păstrate pentru compatibilitate și documentele existente. Valorile vechi `fiscal_status=pending/failed` nu mai reprezintă o coadă automată și nu sunt afișate clientului ca progres al emiterii.

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

Raportul fără secrete este `.artifacts/production-readiness.json`. Configurația locală nu dovedește configurația deploymentului. După verificarea Stripe, a emailurilor și a procedurii de facturare manuală activați explicit `BILLING_LIVE_ENABLED=true`, reexportați și redeployați. Portalul de anulare și reconcilierea abonamentelor existente funcționează independent de oprirea vânzărilor noi.

Marcați handoff-ul desktop ca verificat numai după acceptarea serverului, emailului și plăților. Apoi compilați valorile publice în installer și testați o instalare nouă. Vechile conturi staging trebuie să accepte termenii comerciali în `/account`; până atunci API-ul returnează `403 terms_acceptance_required` fără să ocupe un dispozitiv.

Surse tehnice: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Vercel environment variables](https://vercel.com/docs/environment-variables).
