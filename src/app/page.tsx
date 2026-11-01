import Link from "next/link";
import type { Metadata } from "next";
import { AccountCallout, MarketingShell } from "@/components/marketing/shell";
import { MatrixPreview, ReceiptPreview, UploadPreview } from "@/components/marketing/workflow-previews";
import { productUpdates } from "@/lib/product-updates";

export const metadata: Metadata = {
  title: "Declaut — declarațiile, în ordine",
  description: "Declaut pentru Windows: import Excel, matricea declarațiilor, trimitere la ANAF, rectificative D710 și arhivarea recipiselor, într-un singur flux de lucru.",
};

export default function Home() {
  return <MarketingShell>
    <section className="marketing-hero" aria-labelledby="hero-title"><div className="marketing-hero-copy"><p className="eyebrow">DECLAUT PENTRU WINDOWS</p><h1 id="hero-title"><span data-motion-line>Mai puțin timp</span><br /><span data-motion-line>cu declarațiile.</span></h1><p>De la matricea declarațiilor la încărcarea în ANAF și verificarea recipiselor. Un flux de lucru mai ușor de urmărit.</p><div className="marketing-hero-actions"><Link className="button button-primary" href="/descarcare">Vezi versiunea pentru Windows <span aria-hidden="true">↗</span></Link><Link className="marketing-text-link" href="#cum-functioneaza">Descoperă fluxul <span aria-hidden="true">↓</span></Link></div><span className="marketing-release-note"><i /> Versiune preliminară (pre-release).</span></div><div className="marketing-hero-preview"><MatrixPreview compact /></div></section>
    <section className="marketing-intro" data-motion-group id="cum-functioneaza" aria-labelledby="workflow-title"><p className="eyebrow">UN FLUX CLAR</p><div><h2 id="workflow-title">Vezi ce ai de făcut.<br />Știi unde ai ajuns.</h2><p>Declaut aduce împreună cele trei momente ale lucrului cu declarațiile: organizarea, încărcarea și verificarea rezultatului.</p></div></section>
    <section className="marketing-workflow-row" aria-labelledby="matrix-title"><div className="marketing-workflow-copy" data-motion-group><span className="marketing-step-number">01 / ORGANIZARE</span><h2 id="matrix-title">Imaginea de ansamblu,<br />fără căutări.</h2><p>Importă firmele din Excel, pornind de la modelul din aplicație. Matricea pune companiile și declarațiile într-o vedere comună, cu rectificativele D710 alături de D100.</p><span className="marketing-detail">Import Excel · declarații · rectificative</span></div><MatrixPreview /></section>
    <section className="marketing-workflow-row reversed" aria-labelledby="upload-title"><div className="marketing-workflow-copy" data-motion-group><span className="marketing-step-number">02 / ÎNCĂRCARE</span><h2 id="upload-title">Următorul pas,<br />în același flux.</h2><p>Declaut scanează folderele sursă în fundal și identifică fișierele deja trimise. Verifici documentele înainte de încărcare, apoi urmărești rezultatul și detaliile eventualelor erori.</p><span className="marketing-detail">Scanare · verificare · trimitere</span></div><UploadPreview /></section>
    <section className="marketing-workflow-row" aria-labelledby="receipt-title"><div className="marketing-workflow-copy" data-motion-group><span className="marketing-step-number">03 / VERIFICARE</span><h2 id="receipt-title">Recipisa nu mai este<br />un pas uitat.</h2><p>Verificarea automată a recipisei păstrează rezultatul alături de declarație. Documentele sunt organizate pe firmă, an și lună, în folderul de arhivă ales de tine.</p><span className="marketing-detail">Verificare · rezultat · arhivă</span></div><ReceiptPreview /></section>
    <section className="marketing-context-note" data-motion-group><p>Ilustrațiile de mai sus explică fluxul propus. Nu sunt capturi din aplicația publicată; interfața poate evolua până la lansare.</p><Link href="/intrebari-frecvente">Întrebări înainte să începi <span aria-hidden="true">↗</span></Link></section>
    <section className="marketing-latest-updates" aria-labelledby="updates-title">
      <div className="marketing-updates-heading" data-motion-group><div><p className="eyebrow">NOU ÎN DECLAUT</p><h2 id="updates-title">Mai multă ordine.<br />Mai puțini pași.</h2></div><Link className="marketing-text-link" href="/noutati">Vezi toate noutățile <span aria-hidden="true">↗</span></Link></div>
      <div className="marketing-update-grid" data-motion-group>{productUpdates.slice(0, 3).map((update) => <article className="marketing-update-card" key={update.id}>
        <time dateTime={update.date}>{update.dateLabel}</time><h3><Link href={`/noutati#${update.id}`}>{update.title}</Link></h3><p>{update.summary}</p>
      </article>)}</div>
      <p className="marketing-updates-availability">Noutăți din dezvoltarea aplicației. Funcțiile disponibile depind de versiunea instalată.</p>
    </section>
    <AccountCallout />
  </MarketingShell>;
}
