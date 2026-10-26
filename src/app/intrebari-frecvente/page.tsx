import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, PageHeading } from "@/components/marketing/shell";
import { FREE_MAX_FIRMS } from "@/lib/license/plans";

export const metadata: Metadata = { title: "Întrebări frecvente — Declaut", description: "Răspunsuri despre Declaut, Windows, cont, licențele Free și Pro și dispozitive." };

const questions = [
  { question: "Ce este Declaut?", answer: "Declaut este o aplicație desktop în dezvoltare pentru lucrul cu declarațiile ANAF: o matrice pentru organizare, încărcarea declarațiilor și urmărirea automată a recipiselor. Site-ul gestionează contul și licența aplicației." },
  { question: "Pe ce sistem de operare funcționează?", answer: "Versiunea pregătită este pentru Windows 10 și Windows 11. Pagina de descărcare va afișa instalatorul public atunci când este disponibil." },
  { question: "Pot descărca aplicația acum?", answer: "Verifică pagina Descarcă. Dacă nu apare un instalator, versiunea publică nu este încă disponibilă. Nu este nevoie să cauți un link în altă parte." },
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
    <section className="marketing-faq-list" aria-label="Întrebări și răspunsuri">{questions.map(({ question, answer }, index) => <details key={question} open={index === 0}><summary>{question}<span aria-hidden="true">+</span></summary><div><p>{answer}</p></div></details>)}</section>
    <section className="marketing-small-faq"><h2>Mai ai o întrebare?</h2><p>Pagina de contact îți arată cum poți lua legătura cu noi când canalul de suport este disponibil.</p><Link className="marketing-text-link" href="/contact">Vezi contactul <span aria-hidden="true">↗</span></Link></section>
  </MarketingShell>;
}
