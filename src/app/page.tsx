import Link from "next/link";
import type { Metadata } from "next";
import { AccountCallout, MarketingShell } from "@/components/marketing/shell";
import { MatrixPreview } from "@/components/marketing/workflow-previews";
import { WorkflowStory } from "@/components/marketing/workflow-story";
import { WorkflowFallback } from "@/components/marketing/workflow-fallback";
import { getSiteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Declaut — declarațiile, în ordine",
  description: "Declaut pentru Windows: import Excel, matricea declarațiilor, trimitere la ANAF, rectificative D710 și arhivarea recipiselor, într-un singur flux de lucru.",
};

export default function Home() {
  return <MarketingShell>
    <section className="marketing-hero" aria-labelledby="hero-title"><div className="marketing-hero-copy"><p className="eyebrow">DECLAUT PENTRU WINDOWS</p><h1 id="hero-title"><span data-motion-line>Mai puțin timp</span><br /><span data-motion-line>cu declarațiile.</span></h1><p>De la matricea declarațiilor la încărcarea în ANAF și verificarea recipiselor. Un flux de lucru mai ușor de urmărit.</p><div className="marketing-hero-actions"><Link className="button button-primary" href="/descarcare">Vezi versiunea pentru Windows <span aria-hidden="true">↗</span></Link><Link className="marketing-text-link" href="#cum-functioneaza">Descoperă fluxul <span aria-hidden="true">↓</span></Link></div><span className="marketing-release-note"><i /> {getSiteConfig().isStaging ? "Versiune preliminară (pre-release)." : "Pentru Windows 10 și 11."}</span></div><div className="marketing-hero-preview"><MatrixPreview compact /></div></section>
    <section className="marketing-intro" data-motion-group id="cum-functioneaza" aria-labelledby="workflow-title"><p className="eyebrow">UN FLUX CLAR</p><div><h2 id="workflow-title">Vezi ce ai de făcut.<br />Știi unde ai ajuns.</h2><p>Declaut aduce împreună cele trei momente ale lucrului cu declarațiile: organizarea, încărcarea și verificarea rezultatului.</p></div></section>
    <WorkflowStory><WorkflowFallback /></WorkflowStory>
    <section className="marketing-context-note" data-motion-group><p>Ilustrațiile de mai sus explică fluxul propus. Nu sunt capturi din aplicația publicată; interfața poate diferi în funcție de versiunea instalată.</p><Link href="/intrebari-frecvente">Întrebări înainte să începi <span aria-hidden="true">↗</span></Link></section>
    <AccountCallout />
  </MarketingShell>;
}
