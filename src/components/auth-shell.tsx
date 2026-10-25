import Link from "next/link";

export function AuthShell({ eyebrow = "CONTUL TĂU", title, description, children, footer }: {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return <main className="site-shell auth-shell">
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Declaut, pagina principală">declaut<span>.</span></Link>
      <span className="environment-label">Mediu de testare</span>
    </header>
    <div className="auth-content">
      <div className="auth-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="description">{description}</p></div>
      {children}
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
    <footer className="site-footer"><span>Declaut</span><Link href="/politica-de-confidentialitate">Confidențialitate</Link></footer>
  </main>;
}
