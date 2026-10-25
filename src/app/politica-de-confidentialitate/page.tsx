import Link from "next/link";

export default function StagingPrivacy() {
  return <main className="site-shell"><header className="site-header"><Link className="wordmark" href="/">declaut<span>.</span></Link><span className="environment-label">Mediu de testare</span></header>
    <article className="legal-content"><p className="eyebrow">TESTARE</p><h1>Date și confidențialitate</h1>
      <p>Această notă descrie funcționarea tehnică a mediului de testare. Politica de confidențialitate pentru lansarea comercială, cu datele operatorului și informațiile complete, va fi publicată separat.</p>
      <h2>Datele contului</h2><p>La înregistrare folosim adresa de email, numele companiei, CUI-ul și acceptarea versiunii curente a termenilor. Parola este gestionată de serviciul de autentificare Supabase și nu este stocată în tabelul de profiluri.</p>
      <h2>Autentificare și licențe</h2><p>Site-ul folosește cookie-uri necesare pentru sesiunea de autentificare. La solicitarea unei licențe, backendul înregistrează identificatorul și numele dispozitivului, împreună cu momentul ultimei utilizări.</p>
      <h2>Servicii folosite</h2><p>Aplicația web rulează pe Vercel, iar autentificarea și baza de date folosesc Supabase. Nu am adăugat servicii de analiză a traficului sau cookie-uri de marketing.</p>
      <p><Link href="/termeni-si-conditii">Termenii mediului de testare</Link></p><p><Link href="/signup">Înapoi la înregistrare</Link></p>
    </article></main>;
}
