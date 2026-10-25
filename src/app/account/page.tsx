import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { sessionClient } from "@/lib/server/session";
import { accountEntitlement, documentUrl, formatDate, type Subscription } from "@/lib/account/entitlements";
import { billingReadiness } from "@/lib/billing/config";
import { DeviceList, type AccountDevice } from "@/components/account/device-list";
import { BillingActions } from "@/components/account/billing-actions";
import { PaymentStatus } from "@/components/account/payment-status";
import "./account.css";

export const dynamic = "force-dynamic";

type Invoice = {
  id: string;
  status: string;
  currency: string;
  amount_paid: number;
  stripe_invoice_number: string | null;
  stripe_hosted_invoice_url: string | null;
  fiscal_status: string;
  fiscal_number: string | null;
  fiscal_pdf_url: string | null;
  created_at: string;
};

function amount(invoice: Invoice) {
  try { return new Intl.NumberFormat("ro-RO", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.amount_paid / 100); }
  catch { return "—"; }
}

export default async function Account({ searchParams }: { searchParams: Promise<{ paid?: string; billing_error?: string; checkout?: string }> }) {
  const { paid, billing_error, checkout } = await searchParams;
  const supabase = await sessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) redirect("/login");
  const [profileResult, subscriptionResult, deviceResult, invoiceResult] = await Promise.all([
    supabase.from("profiles").select("company_name,cui,stripe_customer_id").eq("id", data.user.id).maybeSingle(),
    supabase.from("subscriptions").select("id,status,price_id,current_period_start,current_period_end,cancel_at_period_end,is_pro").eq("user_id", data.user.id),
    supabase.from("devices").select("id,device_id,device_name,created_at,last_seen_at").eq("user_id", data.user.id).order("created_at").order("id"),
    supabase.from("billing_invoices").select("id,status,currency,amount_paid,stripe_invoice_number,stripe_hosted_invoice_url,fiscal_status,fiscal_number,fiscal_pdf_url,created_at").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const profile = profileResult.data;
  const entitlement = accountEntitlement((subscriptionResult.data ?? []) as Subscription[]);
  const readiness = billingReadiness();
  const pro = entitlement.plan === "pro";
  const invoices = (invoiceResult.data ?? []) as Invoice[];
  return <main className="site-shell account-page">
    <header className="site-header"><Link className="wordmark" href="/" aria-label="Declaut, pagina principală">declaut<span>.</span></Link><nav className="site-nav" aria-label="Navigare cont"><Link href="/descarcare">Descarcă aplicația</Link><Link href="/contact">Ajutor</Link></nav></header>
    <div className="account-body">
      <div className="account-heading"><div><p className="eyebrow">SPAȚIUL TĂU</p><h1>Contul tău.</h1><p className="description">Abonamentul și dispozitivele tale, într-un singur loc.</p></div><span className="environment-label">Mediu de testare</span></div>
      {paid === "1" && !subscriptionResult.error && <PaymentStatus pro={pro} />}
      {billing_error && <p className="form-message error-message" role="alert">Gestionarea abonamentului nu este disponibilă momentan. Încearcă din nou mai târziu.</p>}
      {checkout === "cancelled" && <p className="form-message success-message" role="status">Ai revenit din pagina de plată. Poți relua procesul când dorești.</p>}
      <div className="account-top-grid">
        <section className="account-panel plan-panel" aria-labelledby="account-plan-title"><div className="panel-heading"><h2 id="account-plan-title">Abonament</h2><span className={`plan-badge ${pro ? "is-pro" : ""}`}>{subscriptionResult.error ? "Indisponibil" : pro ? "Pro" : "Free"}</span></div>
          {subscriptionResult.error ? <p className="form-message error-message" role="alert">Nu am putut încărca abonamentul. Reîncarcă pagina pentru a încerca din nou.</p> : <><p className="plan-name">Declaut {pro ? "Pro" : "Free"}</p><p className="account-muted">{pro ? "Acces Pro pe maximum două dispozitive." : "Acces Free în aplicația Declaut."}</p>
            {pro && entitlement.subscription && <dl className="plan-period"><dt>{entitlement.grace ? "Acces în perioada de grație până la" : entitlement.subscription.cancel_at_period_end ? "Abonamentul se încheie la" : entitlement.subscription.status === "trialing" ? "Perioada de test se încheie la" : "Următoarea reînnoire"}</dt><dd>{formatDate(entitlement.grace ? entitlement.proUntil : entitlement.subscription.current_period_end)}</dd></dl>}
            {entitlement.grace && <p className="account-notice">Plata necesită atenție. Accesul Pro continuă cel mult 72 de ore de la începutul perioadei curente.</p>}
            {!pro && entitlement.subscription?.is_pro !== false && entitlement.subscription?.status === "past_due" && Date.parse(entitlement.subscription.current_period_start) + 72 * 3_600_000 <= Date.now() && <p className="account-notice">Perioada de grație a expirat. Planul este Free până la confirmarea unei plăți eligibile.</p>}
          </>}
          <BillingActions portal={readiness.portalReady && Boolean(profile?.stripe_customer_id)} checkout={!subscriptionResult.error && !pro && readiness.checkoutReady} />
          <Link className="account-plan-link" href="/preturi">Vezi planurile și prețurile</Link>
        </section>
        <section className="account-panel" aria-labelledby="account-profile-title"><div className="panel-heading"><h2 id="account-profile-title">Datele contului</h2></div><dl className="account-details"><div><dt>Email</dt><dd>{data.user.email}</dd></div>{profile?.company_name && <div><dt>Companie</dt><dd>{profile.company_name}</dd></div>}{profile?.cui && <div><dt>CUI</dt><dd>{profile.cui}</dd></div>}</dl>{profileResult.error && <p className="account-muted">Datele companiei nu au putut fi încărcate.</p>}<Link className="account-password-link" href="/forgot-password">Schimbă parola</Link></section>
      </div>
      <section className="account-panel" aria-labelledby="account-devices-title"><div className="panel-heading"><div><h2 id="account-devices-title">Dispozitive</h2><p>Gestionează calculatoarele pe care folosești Declaut.</p></div><span className="account-count">{deviceResult.error ? "—" : `${deviceResult.data?.length ?? 0} înregistrate`}</span></div>{deviceResult.error ? <p className="form-message error-message" role="alert">Dispozitivele nu au putut fi încărcate. Reîncarcă pagina pentru a încerca din nou.</p> : <DeviceList devices={(deviceResult.data ?? []) as AccountDevice[]} pro={pro && !subscriptionResult.error} />}</section>
      <section className="account-panel" aria-labelledby="account-invoices-title"><div className="panel-heading"><div><h2 id="account-invoices-title">Plăți și facturi</h2><p>Documentele aferente abonamentului tău.</p></div></div>
        {invoiceResult.error ? <p className="account-muted">Documentele nu sunt disponibile momentan.</p> : !invoices.length ? <div className="account-empty"><p>Încă nu ai documente de plată.</p><p>Ele vor apărea aici după o plată confirmată.</p></div> : <div className="invoice-table-wrap"><table className="invoice-table"><caption className="sr-only">Ultimele documente de plată ale contului</caption><thead><tr><th scope="col">Data</th><th scope="col">Document</th><th scope="col">Sumă plătită</th><th scope="col">Stare</th></tr></thead><tbody>{invoices.map((invoice) => {
          const stripeUrl = documentUrl(invoice.stripe_hosted_invoice_url, true);
          const fiscalUrl = documentUrl(invoice.fiscal_pdf_url);
          return <tr key={invoice.id}><td>{formatDate(invoice.created_at)}</td><td>{invoice.fiscal_number ? <>{fiscalUrl ? <a href={fiscalUrl} target="_blank" rel="noopener noreferrer">Factura {invoice.fiscal_number}<span className="sr-only"> (PDF, filă nouă)</span></a> : `Factura ${invoice.fiscal_number}`}</> : <><span>{invoice.stripe_invoice_number ?? "Plată abonament"}</span><small>{invoice.fiscal_status === "not_due" ? "Factura fiscală: după plată" : invoice.fiscal_status === "failed" ? "Factura fiscală: în curs de verificare" : "Factura fiscală: în așteptare"}</small></>}{stripeUrl && <a className="stripe-document" href={stripeUrl} target="_blank" rel="noopener noreferrer">Document Stripe<span className="sr-only"> (filă nouă)</span></a>}</td><td>{amount(invoice)}</td><td>{invoice.status === "paid" ? "Plătită" : invoice.status === "void" ? "Anulată" : "În așteptare"}</td></tr>;
        })}</tbody></table></div>}
        <p className="account-explainer">Documentele de plată Stripe nu sunt facturi fiscale. Facturile fiscale vor fi emise separat prin furnizorul de facturare, după configurarea acestuia.</p>
      </section>
      <div className="account-signout"><AuthForm kind="logout" /></div>
    </div>
    <footer className="site-footer"><span>Declaut</span><div><Link href="/termeni-si-conditii">Termeni</Link><Link href="/politica-de-confidentialitate">Confidențialitate</Link><Link href="/contact">Contact</Link></div></footer>
  </main>;
}
