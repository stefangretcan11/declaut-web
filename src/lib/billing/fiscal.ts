import { BillingError } from "./config";
import type { FiscalIssuer } from "./oblio";
import type { BillingStore, InvoiceSnapshot } from "./types";

export async function issueFiscalInvoice(store: BillingStore, issue: FiscalIssuer, invoice: InvoiceSnapshot, userId: string) {
  if (invoice.status !== "paid" || invoice.amount_paid === 0) return;
  if (await store.fiscalIssued(invoice.id, userId)) return;
  const issueDate = await store.fiscalIssueDate(invoice.id, userId);
  const document = await issue({ ...invoice, fiscal_issue_date: issueDate }, await store.getProfile(userId));
  if (!await store.completeFiscal(invoice.id, userId, document.number, document.url)) throw new BillingError(503, "fiscal_save_unavailable");
}
