import Image from "next/image";
import Link from "next/link";

const steps = [
  {
    title: "Apasă „More info”",
    description: <>În fereastra Windows, apasă <strong>„More info”</strong> („Mai multe informații”) pentru a vedea detaliile aplicației.</>,
    image: "/images/installation/smartscreen-more-info.svg",
    alt: "Exemplu SmartScreen: mesajul Windows protected your PC, cu opțiunea More info evidențiată.",
    width: 534,
    height: 494,
  },
  {
    title: "Verifică detaliile și apasă „Run anyway”",
    description: <>Verifică instalatorul <strong>declaut-setup.exe</strong> și editorul <strong>Mihai Costache</strong>, apoi apasă <strong>„Run anyway”</strong> („Executați oricum”).</>,
    image: "/images/installation/smartscreen-run-anyway.svg",
    alt: "Exemplu SmartScreen după More info: instalatorul Declaut, editorul Mihai Costache și butonul Run anyway evidențiat.",
    width: 526,
    height: 489,
  },
];

export function InstallationHelp() {
  return <section className="marketing-installation-help" id="ajutor-instalare" aria-labelledby="smartscreen-title">
    <header className="marketing-installation-heading">
      <p className="eyebrow">AJUTOR LA INSTALARE</p>
      <h2 id="smartscreen-title">Apare mesajul „Windows protected your PC”?</h2>
      <p>Windows poate afișa avertizarea SmartScreen când nu recunoaște încă o aplicație sau o versiune nouă. Mai jos vezi unde găsești opțiunile pentru a continua instalarea.</p>
    </header>
    <p className="marketing-installation-source"><strong>Verifică sursa înainte să continui.</strong> Urmează acești pași doar pentru instalatorul Declaut descărcat folosind butonul de pe această pagină. Acesta duce la versiunea oficială de pe GitHub.</p>
    <ol className="marketing-installation-examples">
      {steps.map((step, index) => <li key={step.image}>
        <figure>
          <figcaption>
            <span className="marketing-installation-number" aria-hidden="true">0{index + 1}</span>
            <div><h3>{step.title}</h3><p>{step.description}</p></div>
          </figcaption>
          <a className="marketing-installation-image" href={step.image} target="_blank" rel="noopener noreferrer" aria-label={`Mărește exemplul pentru pasul ${index + 1} (filă nouă)`}>
            <Image src={step.image} alt={step.alt} width={step.width} height={step.height} />
            <span>Mărește imaginea <span aria-hidden="true">↗</span></span>
          </a>
        </figure>
      </li>)}
    </ol>
    <div className="marketing-installation-notes">
      <p>După „Run anyway”, urmează pașii instalatorului. Ilustrațiile sunt orientative; aspectul și denumirile pot varia în funcție de limba și versiunea Windows.</p>
      <p>Nu vezi butonul „Run anyway” sau ai nevoie de ajutor? <Link href="/contact">Contactează-ne</Link>.</p>
      <a className="marketing-installation-reference" href="https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation" target="_blank" rel="noopener noreferrer">De ce apare avertizarea? Explicația Microsoft <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>
    </div>
  </section>;
}
