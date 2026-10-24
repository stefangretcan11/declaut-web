import Link from "next/link";

export default function Home() {
  return (
    <main>
      <header className="site-header"><Link className="wordmark" href="/" aria-label="Declaut, pagina principală">declaut<span>.</span></Link><nav className="site-nav" aria-label="Cont"><Link href="/login">Autentificare</Link><Link href="/signup">Creează cont</Link></nav></header>
      <section>
        <p className="eyebrow">ÎN CURÂND</p>
        <h1>Mai puțin timp<br />cu declarațiile.</h1>
        <p className="description">Pregătim Declaut pentru Windows și un loc simplu în care să îți gestionezi contul și abonamentul.</p>
        <p className="note">Site-ul este în dezvoltare.</p>
        <div className="home-actions"><Link className="button button-primary" href="/signup">Creează un cont de test</Link><Link className="button button-secondary" href="/login">Am deja cont</Link></div>
      </section>
      <footer>Declaut <span>Un flux de lucru mai simplu.</span></footer>
    </main>
  );
}
