import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageHeading } from "@/components/marketing/shell";
import { getSiteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "Contact — Declaut", description: "Întrebări despre cont, aplicația Declaut și licențe. Datele de contact sunt publicate aici când sunt disponibile." };

export default function Contact() {
  const site = getSiteConfig();
  return <MarketingShell current="/contact"><PageHeading eyebrow="CONTACT" title="Hai să clarificăm."><p>O întrebare despre cont, licență sau aplicație? Începem de aici.</p></PageHeading>
    <section className="marketing-contact-panel" aria-labelledby="contact-title"><p className="eyebrow">SUNTEM AICI</p><h2 id="contact-title">{site.contactEmail ? "Scrie-ne." : "Canalul de contact se pregătește."}</h2>{site.contactEmail ? <><p>Spune-ne pe scurt cu ce te putem ajuta.</p><a className="marketing-contact-email" href={`mailto:${site.contactEmail}`}>{site.contactEmail}<span aria-hidden="true">↗</span></a><p className="marketing-contact-note">Nu trimite parole, chei de acces sau credențiale ANAF prin email.</p></> : <><p>Adresa oficială va fi afișată aici înainte de lansarea publică. Între timp, răspunsurile despre cont și licență sunt în întrebările frecvente.</p><Link className="button button-secondary" href="/intrebari-frecvente">Vezi întrebările frecvente <span aria-hidden="true">↗</span></Link></>}</section>
    <div className="marketing-contact-links"><div><h2>Ai uitat parola?</h2><p>Poți solicita un link nou pentru contul tău.</p><Link href="/forgot-password">Resetează parola <span aria-hidden="true">↗</span></Link></div><div><h2>Cauți instalatorul?</h2><p>Versiunea publică apare pe pagina de descărcare.</p><Link href="/descarcare">Declaut pentru Windows <span aria-hidden="true">↗</span></Link></div></div>
  </MarketingShell>;
}
