import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageHeading } from "@/components/marketing/shell";
import { formatRon, getSiteConfig } from "@/lib/site-config";
import { FREE_MAX_FIRMS } from "@/lib/license/plans";

export const metadata: Metadata = { title: "Free și Pro — Declaut", description: `Declaut Free pentru maximum ${FREE_MAX_FIRMS} firme și Pro cu abonament pentru șase luni sau un an, fără limită de dispozitive.` };

export default function Pricing() {
  const site = getSiteConfig();
  return <MarketingShell current="/preturi"><PageHeading eyebrow="FREE ȘI PRO" title="Un început simplu."><p>Un cont Declaut, două planuri. Alege după felul în care lucrezi.</p></PageHeading>
    <section className="marketing-pricing-grid" aria-label="Planuri Declaut">
      <article className="marketing-plan"><p className="marketing-plan-name">Free</p><h2>Fără abonament.</h2><div className="marketing-price"><strong>0</strong><span>RON</span></div><p className="marketing-plan-description">Un cont și o licență Free pentru maximum {FREE_MAX_FIRMS} firme.</p><ul><li>Cont Declaut individual</li><li>Maximum {FREE_MAX_FIRMS} firme în aplicație</li><li>Fără abonament plătit</li></ul><Link className="button button-secondary" href="/signup">Creează un cont de test</Link></article>
      <article className="marketing-plan marketing-plan-pro"><div className="marketing-plan-label"><p className="marketing-plan-name">Pro</p><span>Fără limită de dispozitive</span></div><h2>Mai mult, cu Pro.</h2><div className="marketing-pro-prices"><p><strong>{formatRon(site.proSemiannualPriceRon)}</strong><span>/ 6 luni</span></p><p><strong>{formatRon(site.proYearlyPriceRon)}</strong><span>/ an</span></p></div><p className="marketing-plan-description">O licență Pro pe toate dispozitivele contului.</p><ul><li>Licență Pro pentru aplicație</li><li>Fără limită de dispozitive</li><li>Abonament pentru șase luni sau un an</li></ul><Link className="button button-primary" href="/account">Vezi contul tău <span aria-hidden="true">↗</span></Link></article>
    </section>
    <aside className="marketing-pricing-note"><p>Prețurile sunt în RON. Disponibilitatea plății și suma finală sunt confirmate înainte de încheierea unui abonament. Nu este necesar un card pentru contul de test. Lista detaliată a funcțiilor desktop din fiecare plan va fi confirmată înainte de lansare.</p></aside>
    <section className="marketing-comparison" aria-labelledby="comparison-title"><h2 id="comparison-title">Ce alegi, concret.</h2><div className="marketing-table-scroll"><table><caption className="sr-only">Comparație între planurile Free și Pro</caption><thead><tr><th scope="col">Planul tău</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead><tbody><tr><th scope="row">Cont pe site și în aplicație</th><td>Inclus</td><td>Inclus</td></tr><tr><th scope="row">Tipul licenței</th><td>Free</td><td>Pro</td></tr><tr><th scope="row">Firme în planul Free</th><td>Maximum {FREE_MAX_FIRMS}</td><td>—</td></tr><tr><th scope="row">Dispozitive care primesc Pro</th><td>—</td><td>Fără limită</td></tr><tr><th scope="row">Abonament</th><td>Fără abonament plătit</td><td>Șase luni sau un an</td></tr></tbody></table></div></section>
    <section className="marketing-small-faq"><h2>Ai nevoie de un detaliu?</h2><p>Găsești explicații despre cont, licență și dispozitive în întrebările frecvente.</p><Link className="marketing-text-link" href="/intrebari-frecvente">Vezi întrebările frecvente <span aria-hidden="true">↗</span></Link></section>
  </MarketingShell>;
}
