import { z } from "zod";
import { BillingError, PLAN_PRICES, type BillingConfig, type BillingInterval } from "./config";
import type { InvoiceSnapshot, SubscriptionSnapshot } from "./types";

const reference = z.union([z.string(), z.object({ id: z.string() })]);
export function stripeId(value: unknown): string | undefined {
  const result = reference.safeParse(value);
  return result.success ? typeof result.data === "string" ? result.data : result.data.id : undefined;
}
const priceSchema = z.object({ id: z.string(), currency: z.string(), unit_amount: z.number().nullable(), active: z.boolean().optional(), recurring: z.object({ interval: z.string(), interval_count: z.number() }).nullable() });
export function validPrice(value: unknown, interval: BillingInterval, requireActive = true): boolean {
  const price = priceSchema.safeParse(value);
  if (!price.success || (requireActive && price.data.active !== true)) return false;
  const expected = PLAN_PRICES[interval];
  return price.data.currency === expected.currency && price.data.unit_amount === expected.amount && price.data.recurring?.interval === expected.interval && price.data.recurring.interval_count === expected.intervalCount;
}

const subscriptionSchema = z.object({
  id: z.string().regex(/^sub_/), customer: reference,
  status: z.enum(["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]),
  cancel_at_period_end: z.boolean(),
  items: z.object({ data: z.array(z.object({
    current_period_start: z.number().int().nonnegative().optional(),
    current_period_end: z.number().int().nonnegative().optional(),
    price: z.unknown(),
  })) }),
});

export function subscriptionSnapshot(value: unknown, config: BillingConfig): SubscriptionSnapshot {
  const subscription = subscriptionSchema.parse(value);
  const item = subscription.items.data[0];
  const priceId = stripeId(item?.price) ?? "unconfigured";
  const interval = (Object.entries(config.prices) as [BillingInterval, string][]).find(([, id]) => id === priceId)?.[0];
  const start = item?.current_period_start ?? 0;
  const end = item?.current_period_end ?? start + 1;
  // Unexpected/mixed plans keep their actual billing status but never grant Pro.
  const isPro = subscription.items.data.length === 1 && item?.current_period_start !== undefined && item?.current_period_end !== undefined
    && Boolean(interval && validPrice(item.price, interval, false)) && end > start;
  return {
    id: subscription.id,
    customer_id: stripeId(subscription.customer)!,
    status: subscription.status,
    price_id: priceId,
    current_period_start: new Date(start * 1000).toISOString(),
    current_period_end: new Date(Math.max(end, start + 1) * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    is_pro: isPro,
  };
}

const invoiceSchema = z.object({
  id: z.string().regex(/^in_/), customer: reference, status: z.string().nullable(), currency: z.string(), amount_paid: z.number().int().nonnegative(),
  number: z.string().nullable(), hosted_invoice_url: z.string().nullable(), invoice_pdf: z.string().nullable(), created: z.number().int(),
  parent: z.object({ subscription_details: z.object({ subscription: reference }).nullable().optional() }).nullable().optional(),
  subscription: reference.nullable().optional(),
});

function stripeDocument(url: string | null, host: string): string | null {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === host && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; }
}

export function invoiceSnapshot(value: unknown): InvoiceSnapshot {
  const invoice = invoiceSchema.parse(value);
  const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription) ?? stripeId(invoice.subscription);
  if (!subscriptionId) throw new BillingError(400, "invoice_without_subscription");
  return {
    id: invoice.id, customer_id: stripeId(invoice.customer)!, subscription_id: subscriptionId, status: invoice.status ?? "draft", currency: invoice.currency, amount_paid: invoice.amount_paid,
    stripe_invoice_number: invoice.number,
    stripe_hosted_invoice_url: stripeDocument(invoice.hosted_invoice_url, "invoice.stripe.com"),
    stripe_invoice_pdf_url: stripeDocument(invoice.invoice_pdf, "pay.stripe.com"),
    created_at: new Date(invoice.created * 1000).toISOString(),
  };
}
