import { z } from "zod";
import type { BillingProfile, InvoiceSnapshot } from "./types";

export class FiscalError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export const oblioConfigSchema = z.object({
  OBLIO_CLIENT_ID: z.email(),
  OBLIO_CLIENT_SECRET: z.string().min(1),
  OBLIO_COMPANY_CIF: z.string().regex(/^(RO)?\d{2,10}$/),
  OBLIO_INVOICE_SERIES: z.string().trim().min(1).max(50),
  OBLIO_VAT_NAME: z.string().trim().max(100).optional(),
  OBLIO_VAT_PERCENT: z.coerce.number().min(0).max(100),
});
export type OblioConfig = z.infer<typeof oblioConfigSchema>;
export type FiscalDocument = { number: string; url: string };
export type FiscalIssuer = (invoice: InvoiceSnapshot, profile: BillingProfile) => Promise<FiscalDocument>;

export function readOblioConfig(env: Record<string, string | undefined> = process.env): OblioConfig {
  // Coercion must never turn an absent/empty VAT setting into an assumed zero.
  if (!env.OBLIO_VAT_PERCENT?.trim()) throw new FiscalError("fiscal_configuration_missing");
  const parsed = oblioConfigSchema.safeParse(env);
  if (!parsed.success) throw new FiscalError("fiscal_configuration_missing");
  return parsed.data;
}

function fiscalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.oblio.eu", "oblio.eu"].includes(url.hostname) || url.username || url.password) throw new FiscalError("fiscal_invalid_document");
  return url.href;
}

export function createOblioIssuer(config: OblioConfig, fetcher: typeof fetch = fetch, clock = Date.now): FiscalIssuer {
  let cached: { value: string; expires: number } | undefined;
  let pendingToken: Promise<string> | undefined;
  let vatName: string | undefined;
  async function token() {
    if (cached && cached.expires > clock() + 60_000) return cached.value;
    pendingToken ??= (async () => {
      const response = await fetcher("https://www.oblio.eu/api/authorize/token", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.OBLIO_CLIENT_ID, client_secret: config.OBLIO_CLIENT_SECRET }),
      });
      if (!response.ok) throw new FiscalError("fiscal_auth_unavailable");
      const parsed = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number().positive() }).safeParse(await response.json());
      if (!parsed.success) throw new FiscalError("fiscal_auth_unavailable");
      cached = { value: parsed.data.access_token, expires: clock() + parsed.data.expires_in * 1000 };
      return cached.value;
    })();
    const request = pendingToken;
    try { return await request; } finally { if (pendingToken === request) pendingToken = undefined; }
  }
  return async (invoice, profile) => {
    if (invoice.status !== "paid" || invoice.currency !== "ron" || invoice.amount_paid <= 0 || (invoice.total !== undefined && invoice.total !== invoice.amount_paid)) throw new FiscalError("fiscal_amount_requires_review");
    const buyer = invoice.buyer;
    const cui = buyer?.cui || profile.cui;
    if (!buyer?.address || !buyer.city || !buyer.country || !/^(RO)?\d{2,10}$/.test(cui ?? "") || buyer.country !== "RO") throw new FiscalError("fiscal_buyer_requires_review");
    const issueDate = invoice.fiscal_issue_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(clock()));
    const accessToken = await token();
    if (!vatName) {
      const url = new URL("https://www.oblio.eu/api/nomenclature/vat_rates"); url.searchParams.set("cif", config.OBLIO_COMPANY_CIF);
      const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new FiscalError("fiscal_vat_unavailable");
      const result = z.object({ status: z.literal(200), data: z.array(z.object({ name: z.string().min(1), percent: z.coerce.number(), default: z.boolean().optional() })) }).safeParse(await response.json());
      if (!result.success) throw new FiscalError("fiscal_vat_unavailable");
      const rates = result.data.data.filter((rate) => rate.percent === config.OBLIO_VAT_PERCENT && (!config.OBLIO_VAT_NAME || rate.name === config.OBLIO_VAT_NAME));
      const selected = rates.length === 1 ? rates[0] : rates.find((rate) => rate.default);
      if (!selected) throw new FiscalError("fiscal_vat_requires_review");
      vatName = selected.name;
    }
    const response = await fetcher("https://www.oblio.eu/api/docs/invoice", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        cif: config.OBLIO_COMPANY_CIF, seriesName: config.OBLIO_INVOICE_SERIES,
        idempotencyKey: `declaut-stripe-${invoice.id}`, internalNote: `Stripe invoice ${invoice.id}`,
        issueDate, dueDate: issueDate, language: "RO", precision: 2, currency: "RON", useStock: 0,
        spvExtern: 1, sendEmail: 1,
        client: { cif: cui, name: buyer.name || profile.company_name, email: buyer.email || profile.email, address: buyer.address, city: buyer.city, state: buyer.state, country: buyer.country, autocomplete: 1, save: 0 },
        products: [{ name: "Abonament Declaut Pro", code: "DECLAUT-PRO", price: invoice.amount_paid / 100, measuringUnit: "buc", quantity: 1, vatName, vatPercentage: config.OBLIO_VAT_PERCENT, vatIncluded: 1, productType: "Serviciu" }],
        collect: { type: "Card", documentNumber: invoice.id, value: invoice.amount_paid / 100 },
      }),
    });
    if (response.status === 401) cached = undefined;
    if (!response.ok) throw new FiscalError("fiscal_provider_unavailable");
    const parsed = z.object({ status: z.literal(200), data: z.object({ seriesName: z.string().min(1), number: z.union([z.string().min(1), z.number().int().nonnegative()]), link: z.string() }) }).safeParse(await response.json());
    if (!parsed.success) throw new FiscalError("fiscal_invalid_document");
    return { number: `${parsed.data.data.seriesName} ${parsed.data.data.number}`, url: fiscalUrl(parsed.data.data.link) };
  };
}
