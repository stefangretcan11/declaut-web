import Link from "next/link";
import { getSiteConfig } from "@/lib/site-config";
import "@/app/marketing.css";

const links = [
  { href: "/preturi", label: "Prețuri" },
  { href: "/descarcare", label: "Descarcă" },
  { href: "/intrebari-frecvente", label: "Întrebări" },
  { href: "/contact", label: "Contact" },
];

function Navigation({ current }: { current?: string }) {
  return <>{links.map(({ href, label }) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>)}</>;
}

export function MarketingShell({ children, current }: { children: React.ReactNode; current?: string }) {
  const site = getSiteConfig();
  const hasOperator = Object.values(site.operator).some(Boolean);
  return <main className="marketing-site">
    <a className="marketing-skip-link" href="#continut">Mergi la conținut</a>
    <header className="marketing-header">
      <Link className="wordmark" href="/" aria-label="Declaut, pagina principală">declaut<span>.</span></Link>
      <nav className="marketing-navigation" aria-label="Navigație principală"><Navigation current={current} /></nav>
      <Link className="marketing-account-link" href="/account">Contul meu <span aria-hidden="true">↗</span></Link>
      <details className="marketing-mobile-navigation"><summary>Meniu <span aria-hidden="true">+</span></summary><nav aria-label="Navigație mobilă"><Navigation current={current} /><Link href="/account">Contul meu</Link></nav></details>
    </header>
    <div className="marketing-content" id="continut" tabIndex={-1}>{children}</div>
    <footer className="marketing-footer">
      <div className="marketing-footer-top"><div><Link className="wordmark" href="/">declaut<span>.</span></Link><p>Un flux de lucru mai simplu.</p></div><nav aria-label="Informații utile"><Link href="/termeni-si-conditii">Termeni și condiții</Link><Link href="/politica-de-confidentialitate">Confidențialitate</Link><Link href="/contact">Contact</Link></nav></div>
      <div className="marketing-footer-meta">{hasOperator && <div className="marketing-operator" aria-label="Datele operatorului">{site.operator.legalName && <strong>{site.operator.legalName}</strong>}{site.operator.cui && <span>CUI: {site.operator.cui}</span>}{site.operator.registrationNumber && <span>Registrul comerțului: {site.operator.registrationNumber}</span>}{site.operator.address && <span>{site.operator.address}</span>}</div>}<nav className="marketing-consumer-links" aria-label="Protecția consumatorilor"><a href="https://anpc.ro/">ANPC <span aria-hidden="true">↗</span></a><a href="https://reclamatiisal.anpc.ro/">Soluționarea alternativă a litigiilor <span aria-hidden="true">↗</span></a></nav></div>
      <div className="marketing-footer-bottom"><span>Declaut · {site.isStaging ? "Mediu de testare" : "Aplicație pentru Windows"}</span><span>{site.isStaging ? "Versiunea publică este în pregătire." : "Windows 10 / 11"}</span></div>
    </footer>
  </main>;
}

export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <header className="marketing-page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><div className="marketing-page-description">{children}</div></header>;
}

export function AccountCallout() {
  return <section className="marketing-account-callout" aria-labelledby="account-callout-title"><div><p className="eyebrow">URMĂTORUL PAS</p><h2 id="account-callout-title">Un cont. Același Declaut.</h2><p>Folosește aceleași date de conectare pe site și în aplicația desktop.</p></div><Link className="button button-primary" href="/signup">Creează un cont de test <span aria-hidden="true">↗</span></Link></section>;
}
