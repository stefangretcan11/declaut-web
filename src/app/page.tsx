import Link from "next/link";
import type { Metadata } from "next";
import { AccountCallout, MarketingShell } from "@/components/marketing/shell";
import { MatrixPreview, ReceiptPreview, UploadPreview } from "@/components/marketing/workflow-previews";

export const metadata: Metadata = {
  title: "Declaut — declarațiile, în ordine",
  description: "Declaut pentru Windows: matricea declarațiilor, încărcarea la ANAF și urmărirea recipiselor, într-un singur flux de lucru.",
};

export default function Home() {
  return <MarketingShell>
    <section className="marketing-hero" aria-labelledby="hero-title"><div className="marketing-hero-copy"><p className="eyebrow">DECLAUT PENTRU WINDOWS</p><h1 id="hero-title">Mai puțin timp<br />cu declarațiile.</h1><p>De la matricea declarațiilor la încărcarea în ANAF și verificarea recipiselor. Un flux de lucru mai ușor de urmărit.</p><div className="marketing-hero-actions"><Link className="button button-primary" href="/descarcare">Vezi versiunea pentru Windows <span aria-hidden="true">↗</span></Link><Link className="marketing-text-link" href="#cum-functioneaza">Descoperă fluxul <span aria-hidden="true">↓</span></Link></div><span className="marketing-release-note"><i /> Versiune preliminară (pre-release).</span></div><div className="marketing-hero-preview"><MatrixPreview compact /></div></section>
    <section className="marketing-intro" id="cum-functioneaza" aria-labelledby="workflow-title"><p className="eyebrow">UN FLUX CLAR</p><div><h2 id="workflow-title">Vezi ce ai de făcut.<br />Știi unde ai ajuns.</h2><p>Declaut aduce împreună cele trei momente ale lucrului cu declarațiile: organizarea, încărcarea și verificarea rezultatului.</p></div></section>
    <section className="marketing-workflow-row" aria-labelledby="matrix-title"><div className="marketing-workflow-copy"><span className="marketing-step-number">01 / ORGANIZARE</span><h2 id="matrix-title">Imaginea de ansamblu,<br />fără căutări.</h2><p>Matricea pune companiile și declarațiile într-o vedere comună. Urmărești stările și identifici mai ușor ce urmează.</p><span className="marketing-detail">Companii · declarații · stări</span></div><MatrixPreview /></section>
    <section className="marketing-workflow-row reversed" aria-labelledby="upload-title"><div className="marketing-workflow-copy"><span className="marketing-step-number">02 / ÎNCĂRCARE</span><h2 id="upload-title">Următorul pas,<br />în același flux.</h2><p>Încărcarea declarațiilor la ANAF își are locul alături de organizarea lor. De la documentul selectat la urmărirea rezultatului.</p><span className="marketing-detail">Document · încărcare · urmărire</span></div><UploadPreview /></section>
    <section className="marketing-workflow-row" aria-labelledby="receipt-title"><div className="marketing-workflow-copy"><span className="marketing-step-number">03 / VERIFICARE</span><h2 id="receipt-title">Recipisa nu mai este<br />un pas uitat.</h2><p>Verificarea automată a recipisei face parte din fluxul Declaut. Rezultatul rămâne alături de declarația la care se referă.</p><span className="marketing-detail">Verificare · rezultat · context</span></div><ReceiptPreview /></section>
    <section className="marketing-context-note"><p>Ilustrațiile de mai sus explică fluxul propus. Nu sunt capturi din aplicația publicată; interfața poate evolua până la lansare.</p><Link href="/intrebari-frecvente">Întrebări înainte să începi <span aria-hidden="true">↗</span></Link></section>
    <AccountCallout />
  </MarketingShell>;
}
