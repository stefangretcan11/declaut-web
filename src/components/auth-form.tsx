"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";

export type AuthKind = "signup" | "login" | "forgot-password" | "resend-confirmation" | "reset-password" | "confirm" | "logout";
const labels: Record<AuthKind, string> = {
  signup: "Creează contul", login: "Autentifică-te", "forgot-password": "Trimite linkul de resetare", "resend-confirmation": "Retrimite emailul", "reset-password": "Salvează parola", confirm: "Continuă", logout: "Deconectează-te",
};

export function AuthForm({ kind, initialMessage, tokenHash, confirmationType }: {
  kind: AuthKind;
  initialMessage?: string;
  tokenHash?: string;
  confirmationType?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialMessage);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isSignup = kind === "signup";
  const isReset = kind === "reset-password";
  const hasEmail = ["signup", "login", "forgot-password", "resend-confirmation"].includes(kind);
  const hasPassword = isSignup || isReset || kind === "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true); setError(undefined); setFields({});
    try {
      const response = await fetch(form.action, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }, body: new FormData(form) });
      const result = await response.json();
      if (response.ok && typeof result.redirect_to === "string") {
        // Only destinations on this origin are allowed, including on error paths.
        const target = new URL(result.redirect_to, window.location.origin);
        if (target.origin !== window.location.origin) throw new Error("Invalid redirect");
        window.location.replace(`${target.pathname}${target.search}`);
        return;
      }
      const nextFields = result.fields ?? {};
      setFields(nextFields);
      setError(result.message ?? "Nu am putut finaliza cererea. Încearcă din nou.");
      requestAnimationFrame(() => {
        const first = Object.keys(nextFields)[0];
        const control = first ? formRef.current?.elements.namedItem(first) : undefined;
        if (control instanceof HTMLElement) control.focus(); else errorRef.current?.focus();
      });
    } catch {
      setError("Nu ne-am putut conecta. Verifică conexiunea și încearcă din nou.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
    setPending(false);
  }

  const described = (name: string, hint?: string) => [hint, fields[name] ? `${name}-error` : undefined].filter(Boolean).join(" ") || undefined;
  const fieldError = (name: string) => fields[name] && <p className="field-error" id={`${name}-error`}>{fields[name]}</p>;

  return <form ref={formRef} className="auth-form" action={`/api/auth/${kind}`} method="post" onSubmit={submit} aria-busy={pending}>
    {error && <div ref={errorRef} className="form-message error-message" role="alert" tabIndex={-1}>{error}</div>}
    {isSignup && <div className="field"><label htmlFor="company_name">Companie</label><input id="company_name" name="company_name" autoComplete="organization" required minLength={2} maxLength={160} aria-invalid={Boolean(fields.company_name)} aria-describedby={described("company_name")} />{fieldError("company_name")}</div>}
    {isSignup && <div className="field"><label htmlFor="cui">CUI</label><input id="cui" name="cui" autoCapitalize="characters" spellCheck={false} required maxLength={16} aria-invalid={Boolean(fields.cui)} aria-describedby={described("cui", "cui-hint")} /><p className="field-hint" id="cui-hint">Cu sau fără prefixul RO.</p>{fieldError("cui")}</div>}
    {hasEmail && <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} aria-invalid={Boolean(fields.email)} aria-describedby={described("email")} />{fieldError("email")}</div>}
    {hasPassword && <div className="field">
      <div className="label-row"><label htmlFor="password">{isReset ? "Parolă nouă" : "Parolă"}</label>{kind === "login" && <Link href="/forgot-password">Ai uitat parola?</Link>}</div>
      <div className="password-control"><input id="password" type={showPassword ? "text" : "password"} name="password" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={kind === "login" ? 1 : 12} maxLength={kind === "login" ? 256 : 128} aria-invalid={Boolean(fields.password)} aria-describedby={described("password", kind === "login" ? undefined : "password-hint")} /><button className="password-toggle" type="button" aria-controls="password" aria-pressed={showPassword} aria-label={showPassword ? "Ascunde parola" : "Arată parola"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Ascunde" : "Arată"}</button></div>
      {kind !== "login" && <p className="field-hint" id="password-hint">Cel puțin 12 caractere.</p>}{fieldError("password")}
    </div>}
    {isReset && <div className="field"><label htmlFor="confirm_password">Repetă parola nouă</label><input id="confirm_password" type="password" name="confirm_password" autoComplete="new-password" required minLength={12} maxLength={128} aria-invalid={Boolean(fields.confirm_password)} aria-describedby={described("confirm_password")} />{fieldError("confirm_password")}</div>}
    {isSignup && <div className="consent-field"><label className="checkbox-label" htmlFor="terms"><input id="terms" name="terms" type="checkbox" required aria-invalid={Boolean(fields.terms)} aria-describedby={described("terms")} /><span>Accept <Link href="/termeni-si-conditii" target="_blank" rel="noopener">termenii mediului de testare<span className="sr-only"> (se deschide într-o filă nouă)</span></Link> și am citit <Link href="/politica-de-confidentialitate" target="_blank" rel="noopener">nota de confidențialitate<span className="sr-only"> (se deschide într-o filă nouă)</span></Link>.</span></label>{fieldError("terms")}</div>}
    {kind === "confirm" && <><input type="hidden" name="token_hash" value={tokenHash ?? ""} /><input type="hidden" name="type" value={confirmationType ?? ""} /></>}
    <button className={kind === "logout" ? "button button-secondary" : "button button-primary"} disabled={pending} type="submit">{pending ? "Se procesează…" : labels[kind]}</button>
  </form>;
}
