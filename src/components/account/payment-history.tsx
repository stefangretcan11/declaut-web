import { documentUrl, formatDate } from "@/lib/account/entitlements";

export type PaymentDocument = {
  id: string;
  status: string;
  currency: string;
  amount_paid: number;
  stripe_invoice_number: string | null;
  stripe_hosted_invoice_url: string | null;
  fiscal_number: string | null;
  fiscal_pdf_url: string | null;
  created_at: string;
};

function amount(invoice: PaymentDocument) {
  try { return new Intl.NumberFormat("ro-RO", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.amount_paid / 100); }
  catch { return "—"; }
}

export function PaymentHistory({ invoices, unavailable = false }: { invoices: PaymentDocument[]; unavailable?: boolean }) {
  return <section className="account-panel" aria-labelledby="account-invoices-title">
    <div className="panel-heading"><div><h2 id="account-invoices-title">Plăți și facturi</h2><p>Istoricul plăților pentru abonamentul tău.</p></div></div>
    {unavailable ? <p className="account-muted">Documentele nu sunt disponibile momentan.</p> : !invoices.length ? <div className="account-empty"><p>Încă nu ai documente de plată.</p><p>Ele vor apărea aici după confirmarea abonamentului sau a unei plăți.</p></div> : <div className="invoice-table-wrap"><table className="invoice-table">
      <caption className="sr-only">Ultimele documente de plată ale contului</caption>
      <thead><tr><th scope="col">Data</th><th scope="col">Document</th><th scope="col">Sumă plătită</th><th scope="col">Stare</th></tr></thead>
      <tbody>{invoices.map((invoice) => {
        const stripeUrl = documentUrl(invoice.stripe_hosted_invoice_url, true);
        const fiscalUrl = documentUrl(invoice.fiscal_pdf_url);
        return <tr key={invoice.id}>
          <td>{formatDate(invoice.created_at)}</td>
          <td>{invoice.fiscal_number ? <>{fiscalUrl ? <a href={fiscalUrl} target="_blank" rel="noopener noreferrer">Factura {invoice.fiscal_number}<span className="sr-only"> (PDF, filă nouă)</span></a> : `Factura ${invoice.fiscal_number}`}</> : <>
            <span>{invoice.stripe_invoice_number ?? "Plată abonament"}</span>
            <small>{invoice.status === "paid" ? invoice.amount_paid > 0 ? "Factura fiscală este gestionată separat." : "Nu s-a încasat nicio sumă." : invoice.status === "void" ? "Document anulat." : "Plata nu este confirmată."}</small>
          </>}
            {stripeUrl && <a className="stripe-document" href={stripeUrl} target="_blank" rel="noopener noreferrer">Document Stripe<span className="sr-only"> (filă nouă)</span></a>}
          </td>
          <td>{amount(invoice)}</td><td>{invoice.status === "paid" ? "Plătită" : invoice.status === "void" ? "Anulată" : invoice.status === "uncollectible" ? "Plată nereușită" : "În așteptare"}</td>
        </tr>;
      })}</tbody>
    </table></div>}
    <p className="account-explainer">Facturile fiscale sunt emise manual de contabil și sunt comunicate separat. Documentele Stripe confirmă plățile procesate. Pentru întrebări despre facturi, <a href="/contact">contactează-ne</a>.</p>
  </section>;
}
