"use client";

import { useRef, useState } from "react";

export function BillingActions({ portal, checkout }: { portal: boolean; checkout: boolean }) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const errorRef = useRef<HTMLParagraphElement>(null);
  async function open(kind: "portal" | "checkout", interval?: "semiannual" | "yearly") {
    if (pending) return;
    setPending(interval ?? kind); setError(undefined);
    try {
      const response = await fetch(`/api/${kind}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(interval ? { interval } : {}) });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string") throw new Error();
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) throw new Error();
      window.location.assign(url.href);
      return;
    } catch {
      setError("Gestionarea abonamentului nu este disponibilă momentan. Încearcă din nou mai târziu.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
    setPending(undefined);
  }
  return <div className="billing-actions">
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="form-message error-message">{error}</p>}
    {portal && <button className="button button-primary" type="button" disabled={Boolean(pending)} onClick={() => open("portal")}>{pending ? "Se deschide…" : "Gestionează abonamentul"}</button>}
    {checkout && <><p className="account-muted">La prima activare Pro ai o lună gratuită (30 de zile), cu cardul introdus de la început. După perioada gratuită se debitează automat abonamentul ales. Oferta se acordă o singură dată pe cont; poți anula înainte de finalul ei pentru a evita plata.</p><div className="checkout-choices"><button className="button button-primary" type="button" disabled={Boolean(pending)} onClick={() => open("checkout", "semiannual")}>Pro · 300 RON / 6 luni</button><button className="button button-secondary" type="button" disabled={Boolean(pending)} onClick={() => open("checkout", "yearly")}>Pro · 500 RON / 12 luni</button></div></>}
    {!portal && !checkout && <p className="account-muted">Plățile și gestionarea abonamentelor vor fi disponibile în curând.</p>}
  </div>;
}
