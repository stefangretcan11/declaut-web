import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageHeading } from "@/components/marketing/shell";
import { FREE_MAX_FIRMS } from "@/lib/license/plans";

export const metadata: Metadata = { title: "Întrebări frecvente — Declaut", description: "Răspunsuri despre Declaut, Windows, cont, licențele Free și Pro și dispozitive." };

const questions = [
  { question: "Ce este Declaut?", answer: "Declaut este o aplicație desktop în dezvoltare pentru lucrul cu declarațiile ANAF: importul firmelor din Excel, o matrice pentru organizare, încărcarea declarațiilor, urmărirea automată a recipiselor și arhivarea documentelor. Include D100 cu rectificativa D710, D112, D300, D390, D394, D406 și case de marcat. Site-ul gestionează contul și licența aplicației; pagina Noutăți prezintă îmbunătățirile recente." },
  { question: "Pe ce sistem de operare funcționează?", answer: "Versiunea pregătită este pentru Windows 10 și Windows 11. Pagina de descărcare va afișa instalatorul public atunci când este disponibil." },
  { question: "Pot descărca aplicația acum?", answer: "Verifică pagina Descarcă. Dacă nu apare un instalator, versiunea publică nu este încă disponibilă. Nu este nevoie să cauți un link în altă parte." },
  { question: "Pot importa firmele din Excel?", answer: "Da. Din „Importă din Excel” poți descărca un model gol cu denumirea firmei, CUI-ul, periodicitatea TVA și declarațiile aplicabile, inclusiv D100 + D710. Modelul are liste derulante și o foaie de instrucțiuni. Completezi fișierul și îl imporți în aplicație; se aplică limita de firme a planului tău." },
  { question: "Cum apare rectificativa D710?", answer: "D710 apare în celula D100, cu marcajul „Rectificată”, fără o coloană separată. În dialogul lunii vezi declarația inițială și rectificativa, fiecare cu propria recipisă, index de încărcare și stare." },
  { question: "Cum sunt tratate declarațiile deja trimise?", answer: "Fișierele identice deja trimise, validate sau în prelucrare, sunt ascunse implicit; le poți vedea bifând „Arată și declarațiile deja trimise”. Declarațiile respinse și fișierele noi pentru o perioadă care are deja o depunere apar nebifate, cu explicații în „Observații”. Verifică selecția înainte de trimitere. Textul complet al erorilor poate fi consultat și copiat din „Rezultat trimitere”." },
  { question: "Unde se salvează declarațiile și recipisele?", answer: "Alegi folderul arhivei la prima pornire. Documentele sunt organizate pe firmă, an, lună și tip de declarație. Poți schimba locul din „Folder arhivă” și poți muta și documentele deja arhivate. Alege un folder separat de cel din care trimiți declarațiile, pentru ca arhiva să nu fie scanată ca sursă." },
  { question: "Ce se întâmplă în timpul scanării folderelor?", answer: "Scanarea se face în fundal și afișează progresul, inclusiv pentru folderele dedicate firmelor. Interfața rămâne disponibilă în timpul căutării; poți închide fereastra pentru a opri scanarea. Dacă la trimitere ANAF nu confirmă la timp, verifică în Chrome dacă fișierul a ajuns înainte de a-l retrimite." },
  { question: "Folosesc același cont pe site și în aplicație?", answer: "Da. Adresa de email și parola contului Declaut sunt aceleași pe site și în aplicația desktop. Adresa de email trebuie confirmată înainte de prima autentificare." },
  { question: "Care este diferența dintre Free și Pro?", answer: `Free permite lucrul cu maximum ${FREE_MAX_FIRMS} firme, fără abonament plătit. Pro permite folosirea licenței Pro pe toate dispozitivele contului, fără limită de dispozitive, cu abonament pentru șase luni sau un an. Prețurile sunt pe pagina Prețuri. Lista detaliată a funcțiilor desktop va fi confirmată înainte de lansare.` },
  { question: "Pe câte dispozitive pot folosi Pro?", answer: "Nu există o limită de dispozitive per cont. Cât timp abonamentul este eligibil pentru Pro, toate dispozitivele contului primesc o licență Pro. Fiecare licență este legată de calculatorul pentru care a fost emisă." },
  { question: "Eliminarea unui dispozitiv oprește imediat o licență deja emisă?", answer: "O licență deja emisă rămâne valabilă până la expirarea ei. Eliminarea șterge înregistrarea din cont și nu șterge aplicația de pe acel calculator. Dacă aplicația solicită din nou o licență, dispozitivul se înregistrează din nou și primește planul contului." },
  { question: "Ce se întâmplă dacă nu am internet?", answer: "Aplicația poate verifica o licență deja emisă până la expirarea ei. Pentru reînnoirea licenței este necesară o conexiune. Încărcarea în ANAF și verificarea recipiselor depind, de asemenea, de accesul la serviciile online." },
  { question: "Am uitat parola. Cum reintru în cont?", answer: "Folosește opțiunea Ai uitat parola? de pe pagina de autentificare. Linkul primit prin email îți permite să alegi o parolă nouă. În mediul de testare, livrarea emailurilor poate fi încă în curs de configurare." },
  { question: "Declaut este un serviciu ANAF?", answer: "Nu. Declaut este un proiect independent. Ilustrațiile de pe site prezintă fluxul propus și nu sunt confirmări emise de ANAF." },
  { question: "Pot cumpăra deja Pro?", answer: "Disponibilitatea plății este afișată în cont. Dacă abonamentele nu sunt încă activate, poți folosi contul de test fără să introduci un card." },
];

export default function Faq() {
  return <MarketingShell current="/intrebari-frecvente"><PageHeading eyebrow="ÎNAINTE SĂ ÎNCEPI" title="Câteva răspunsuri clare."><p>Despre aplicație, cont și felul în care funcționează licența.</p></PageHeading>
    <section className="marketing-faq-list" aria-label="Întrebări și răspunsuri">{questions.map(({ question, answer }, index) => <details data-motion-reveal key={question} open={index === 0}><summary>{question}<span aria-hidden="true">+</span></summary><div data-motion-disclosure><p>{answer}</p></div></details>)}</section>
    <section className="marketing-small-faq" data-motion-group><h2>Mai ai o întrebare?</h2><p>Pagina de contact îți arată cum poți lua legătura cu noi când canalul de suport este disponibil.</p><Link className="marketing-text-link" href="/contact">Vezi contactul <span aria-hidden="true">↗</span></Link></section>
  </MarketingShell>;
}
