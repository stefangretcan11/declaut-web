import type { Metadata } from "next";
import Link from "next/link";
import { AccountCallout, MarketingShell, PageHeading } from "@/components/marketing/shell";
import { productUpdates } from "@/lib/product-updates";

export const metadata: Metadata = {
  title: "Noutăți — Declaut",
  description: "Noutăți din Declaut: scanare în fundal, arhivă configurabilă, rectificative D710, verificarea trimiterilor anterioare și model pentru import Excel.",
};

export default function Updates() {
  return <MarketingShell current="/noutati">
    <PageHeading eyebrow="NOUTĂȚI DIN DECLAUT" title="Mai ușor, pas cu pas.">
      <p>Îmbunătățirile recente pentru lucrul cu declarațiile, de la importul firmelor la arhivarea recipiselor.</p>
    </PageHeading>
    <aside className="marketing-updates-note">
      <p>Aceste noutăți urmăresc dezvoltarea aplicației, aflată în testare. Funcțiile disponibile depind de versiunea instalată.</p>
      <Link className="marketing-text-link" href="/descarcare">Vezi versiunea disponibilă <span aria-hidden="true">↗</span></Link>
    </aside>
    <section className="marketing-update-list" aria-label="Actualizări ale aplicației">
      {productUpdates.map((update) => <article className="marketing-update-entry" id={update.id} key={update.id} aria-labelledby={`${update.id}-title`}>
        <div className="marketing-update-meta"><time dateTime={update.date}>{update.dateLabel}</time><span>{update.category}</span></div>
        <div className="marketing-update-body">
          <h2 id={`${update.id}-title`}>{update.title}</h2>
          <p>{update.summary}</p>
          <ul>{update.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
        </div>
      </article>)}
    </section>
    <AccountCallout />
  </MarketingShell>;
}
