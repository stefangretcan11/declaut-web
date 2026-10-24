function Tick() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function MatrixPreview({ compact = false }: { compact?: boolean }) {
  return <figure className={`workflow-preview matrix-preview${compact ? " compact-preview" : ""}`}>
    <div className="preview-window-bar"><span className="preview-window-dot" /><span>Declaut / Declarații</span><span>Octombrie</span></div>
    <div className="preview-window-content"><div className="preview-heading"><strong>Totul, într-un singur loc.</strong><span>Exemplu ilustrativ</span></div>
      <div className="preview-table" role="img" aria-label="Exemplu ilustrativ al matricei: firme pe rânduri, declarații pe coloane și stări de verificare.">
        <div className="preview-table-row preview-table-head"><span>Companie</span><span>D100</span><span>D112</span><span>D300</span></div>
        {["Exemplu SRL", "Atelier Demo", "Firma de Test"].map((name, index) => <div className="preview-table-row" key={name}><span><i>{name[0]}</i>{name}</span><span><b className="preview-status checked"><Tick /><span className="sr-only">Verificat</span></b></span><span><b className={`preview-status ${index === 1 ? "pending" : "checked"}`}>{index === 1 ? <span aria-label="În așteptare">—</span> : <><Tick /><span className="sr-only">Verificat</span></>}</b></span><span><b className={`preview-status ${index === 2 ? "pending" : "checked"}`}>{index === 2 ? <span aria-label="În așteptare">—</span> : <><Tick /><span className="sr-only">Verificat</span></>}</b></span></div>)}
      </div>
      <div className="preview-footnote"><span className="preview-legend"><i /> Stări ușor de urmărit</span><span>3 companii</span></div>
    </div>
    <figcaption>Previzualizare ilustrativă · date fictive</figcaption>
  </figure>;
}

export function UploadPreview() {
  return <figure className="workflow-preview upload-preview"><div className="preview-window-bar"><span className="preview-window-dot" /><span>Declaut / Încărcare ANAF</span></div><div className="preview-window-content"><div className="preview-document"><span aria-hidden="true">↥</span><div><strong>D112 · Exemplu SRL</strong><p>Declarație selectată pentru încărcare</p></div></div><div className="preview-progress"><span /></div><div className="preview-steps"><span><Tick /> Selectare document</span><span><Tick /> Încărcare</span><span className="preview-muted">Urmărire recipisă</span></div></div><figcaption>Previzualizare ilustrativă · nu reprezintă o încărcare reală</figcaption></figure>;
}

export function ReceiptPreview() {
  return <figure className="workflow-preview receipt-preview"><div className="preview-window-bar"><span className="preview-window-dot" /><span>Declaut / Recipise</span></div><div className="preview-window-content"><div className="preview-receipt-status"><span className="preview-receipt-icon"><Tick /></span><div><strong>Starea recipisei, la vedere.</strong><p>Exemplu SRL · D112</p></div></div><dl className="preview-receipt-details"><div><dt>Declarație</dt><dd>D112</dd></div><div><dt>Stare ilustrată</dt><dd>Verificată</dd></div><div><dt>Următorul pas</dt><dd>Consultă documentul</dd></div></dl></div><figcaption>Previzualizare ilustrativă · nu reprezintă un rezultat ANAF real</figcaption></figure>;
}
