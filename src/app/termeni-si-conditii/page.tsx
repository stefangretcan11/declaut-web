import Link from "next/link";
import { TERMS_VERSION } from "@/lib/auth/validation";

export default function StagingTerms() {
  return <main className="site-shell"><header className="site-header"><Link className="wordmark" href="/">declaut<span>.</span></Link><span className="environment-label">Mediu de testare</span></header>
    <article className="legal-content"><p className="eyebrow">TESTARE</p><h1>Termenii mediului de testare</h1><p>Versiune: {TERMS_VERSION}</p>
      <p>Acest site este mediul de testare Declaut. Conturile create aici sunt folosite pentru verificarea autentificării și a licențelor aplicației.</p>
      <h2>Ce accepți la înregistrare</h2><p>Creezi un cont pentru testare, folosind o adresă de email la care ai acces. Confirmarea adresei este necesară înainte de prima autentificare. Păstrează parola și accesul la cont în siguranță.</p>
      <h2>Date de test</h2><p>Folosește date de companie pentru care ai drept de utilizare sau date fictive adecvate testării. Nu introduce documente fiscale, credențiale ANAF sau alte informații confidențiale în acest mediu.</p>
      <h2>Disponibilitatea mediului</h2><p>Funcțiile și datele de test se pot schimba sau pot fi resetate pe parcursul dezvoltării. Înregistrarea aici nu reprezintă achiziția unui abonament comercial.</p>
      <h2>Înainte de lansare</h2><p>Aceste condiții se referă exclusiv la mediul de testare. Termenii comerciali și informațiile complete despre compania care operează Declaut vor fi publicate înaintea lansării.</p>
      <p><Link href="/politica-de-confidentialitate">Date și confidențialitate</Link></p><p><Link href="/signup">Înapoi la înregistrare</Link></p>
    </article></main>;
}
