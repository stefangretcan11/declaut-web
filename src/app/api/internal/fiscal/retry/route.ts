import { createClient } from "@supabase/supabase-js";
import { createFiscalRetryHandler } from "@/lib/billing/retry";
import { readBillingConfig } from "@/lib/billing/config";
import { invoiceSnapshot } from "@/lib/billing/snapshots";
import { issueFiscalInvoice } from "@/lib/billing/fiscal";
import { billingStore, stripeGateway } from "@/lib/server/stripe";
import { issueWithOblio } from "@/lib/server/fiscal";
import { supabaseEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = createFiscalRetryHandler({
  secret: process.env.CRON_SECRET,
  async pending() {
    const config = readBillingConfig(process.env, true);
    if (config.mode !== "live") throw new Error("Fiscal retries require live billing");
    const env = supabaseEnv();
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("billing_invoices").select("id,user_id").eq("status", "paid").gt("amount_paid", 0).in("fiscal_status", ["pending", "failed"]).lte("fiscal_retry_after", new Date().toISOString()).order("fiscal_retry_after").limit(2);
    if (error || !data) throw new Error("Fiscal queue unavailable");
    return data;
  },
  async retry(row) {
    const stripe = stripeGateway(readBillingConfig(process.env, true));
    const invoice = invoiceSnapshot(await stripe.invoice(row.id));
    const store = billingStore();
    if (invoice.id !== row.id || await store.customerOwner(invoice.customer_id) !== row.user_id) throw new Error("Fiscal owner mismatch");
    await issueFiscalInvoice(store, issueWithOblio, invoice, row.user_id);
  },
});
