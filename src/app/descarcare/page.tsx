import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageHeading } from "@/components/marketing/shell";
import { createReleaseReader, releaseOptions } from "@/lib/releases";

export const metadata: Metadata = { title: "Descarcă pentru Windows — Declaut", description: "Descarcă versiunea publică Declaut pentru Windows 10 și Windows 11 atunci când este disponibilă." };
export const revalidate = 3600;
const options = releaseOptions();
const getRelease = createReleaseReader(process.env.GITHUB_RELEASES_REPO, process.env.GITHUB_RELEASE_ASSET_NAME, fetch, Date.now, options);

export default async function Download() {
  const release = await getRelease();
  const available = Boolean(release.download_url);
  return <MarketingShell current="/descarcare"><PageHeading eyebrow="DECLAUT PENTRU WINDOWS" title="Pregătit pentru biroul tău."><p>Un loc pentru declarații, încărcare și recipise. Pe calculatorul pe care lucrezi.</p></PageHeading>
    <section className="marketing-download-panel" aria-labelledby="download-title"><div className="marketing-windows-mark" aria-hidden="true"><i /><i /><i /><i /></div><div className="marketing-download-copy"><span className="marketing-step-number">APLICAȚIA DESKTOP</span><h2 id="download-title">Declaut pentru Windows</h2><p>Windows 10 / Windows 11</p>{release.latest_version && <p className="marketing-version">Versiunea {release.latest_version}</p>}</div><div className="marketing-download-action">{available ? <a className="button button-primary" href={release.download_url!}>Descarcă instalatorul <span aria-hidden="true">↓</span></a> : <><span className="marketing-unavailable" role="status">Instalatorul nu este încă disponibil.</span><p>Publicăm aici linkul când prima versiune este pregătită.</p></>}</div></section>
    {available && options.includePrereleases && <p className="marketing-release-channel">Canal de testare: această descărcare poate fi o versiune preliminară, destinată verificării înainte de lansarea stabilă.</p>}
    <section className="marketing-download-steps" aria-labelledby="install-title"><h2 id="install-title">{available ? "Începi în trei pași." : "Când versiunea este disponibilă."}</h2><ol><li><span>01</span><div><h3>Descarcă instalatorul.</h3><p>Folosește linkul de pe această pagină pentru versiunea disponibilă.</p></div></li><li><span>02</span><div><h3>Instalează pe Windows.</h3><p>Urmează instrucțiunile instalatorului pe Windows 10 sau 11.</p></div></li><li><span>03</span><div><h3>Intră în contul Declaut.</h3><p>Folosește aceeași adresă de email și parolă ca pe site.</p></div></li></ol></section>
    <div className="marketing-download-help"><p>Nu ai încă un cont?</p><Link href="/signup">Creează un cont de test <span aria-hidden="true">↗</span></Link></div>
  </MarketingShell>;
}
