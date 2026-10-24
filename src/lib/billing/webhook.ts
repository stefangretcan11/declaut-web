import { z } from "zod";
import { BillingError, type BillingConfig } from "./config";
import { invoiceSnapshot, stripeId, subscriptionSnapshot } from "./snapshots";
import type { BillingStore, InvoiceSnapshot, StripeGateway } from "./types";

const supported = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"]);
const eventSchema = z.object({ id: z.string().regex(/^evt_/), type: z.string(), livemode: z.boolean(), data: z.object({ object: z.object({ id: z.string() }) }) });

export function createWebhookHandler(deps: { config(): BillingConfig; stripe(config: BillingConfig): StripeGateway; store(): BillingStore }) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const config = deps.config();
      if (!config.webhookSecret) throw new BillingError(503, "billing_unavailable");
      const signature = request.headers.get("stripe-signature");
      if (!signature || signature.length > 2048) throw new BillingError(400, "invalid_signature");
      const reader = request.body?.getReader();
      if (!reader) throw new BillingError(400, "invalid_payload");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1_048_576) { await reader.cancel(); throw new BillingError(413, "request_too_large"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const stripe = deps.stripe(config);
      let event;
      try { event = eventSchema.parse(stripe.event(Buffer.concat(chunks).toString("utf8"), signature, config.webhookSecret)); }
      catch { throw new BillingError(400, "invalid_signature"); }
      if (event.livemode) throw new BillingError(400, "billing_mode_mismatch");
      if (!supported.has(event.type)) return Response.json({ received: true, ignored: true });
      const store = deps.store();
      if (await store.eventProcessed(event.id)) return Response.json({ received: true, duplicate: true });
      let subscriptionId: string | undefined;
      let invoice: InvoiceSnapshot | undefined;
      let checkoutOwner: string | undefined;
      let checkoutCustomer: string | undefined;
      if (event.type === "checkout.session.completed") {
        const checkout = z.object({ mode: z.string(), subscription: z.unknown(), customer: z.unknown(), client_reference_id: z.string().nullable() }).parse(await stripe.checkout(event.data.object.id));
        if (checkout.mode !== "subscription") return Response.json({ received: true, ignored: true });
        subscriptionId = stripeId(checkout.subscription);
        checkoutOwner = checkout.client_reference_id ?? undefined;
        checkoutCustomer = stripeId(checkout.customer);
      } else if (event.type.startsWith("invoice.")) {
        try { invoice = invoiceSnapshot(await stripe.invoice(event.data.object.id)); }
        catch (error) { if (error instanceof BillingError && error.code === "invoice_without_subscription") return Response.json({ received: true, ignored: true }); throw error; }
        subscriptionId = invoice.subscription_id;
      } else subscriptionId = event.data.object.id;
      if (!subscriptionId?.startsWith("sub_")) throw new BillingError(400, "invalid_payload");
      // Allocate the fence before retrieving Stripe state, so a slow older fetch
      // cannot overwrite a newer handler's authoritative result.
      const generation = await store.beginSync(subscriptionId);
      if (invoice) {
        // The first invoice read discovers its immutable subscription reference.
        // Re-read after acquiring the fence so stale invoice data cannot win.
        invoice = invoiceSnapshot(await stripe.invoice(event.data.object.id));
        if (invoice.subscription_id !== subscriptionId) throw new BillingError(400, "invalid_payload");
      }
      const snapshot = subscriptionSnapshot(await stripe.subscription(subscriptionId), config);
      if (snapshot.id !== subscriptionId) throw new BillingError(400, "invalid_payload");
      const owner = await store.customerOwner(snapshot.customer_id);
      if (!owner) return Response.json({ received: true, ignored: true });
      if ((checkoutOwner && checkoutOwner !== owner) || (checkoutCustomer && checkoutCustomer !== snapshot.customer_id) || (invoice && invoice.customer_id !== snapshot.customer_id)) throw new BillingError(400, "billing_customer_mismatch");
      if (!await store.applySync(generation, snapshot, invoice)) throw new BillingError(503, "billing_sync_in_progress");
      await store.completeEvent(event.id, event.type);
      return Response.json({ received: true });
    } catch (error) {
      const known = error instanceof BillingError;
      const status = known ? error.status : 503;
      return Response.json({ error: { code: known ? error.code : "billing_sync_unavailable" } }, { status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "30" } : {}) } });
    }
  };
}
