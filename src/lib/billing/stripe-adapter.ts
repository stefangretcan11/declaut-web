import Stripe from "stripe";
import type { BillingConfig } from "./config";
import type { StripeEvent, StripeGateway } from "./types";

export function createStripeGateway(config: BillingConfig, stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15000 })): StripeGateway {
  return {
    price: (id) => stripe.prices.retrieve(id),
    customer: (id) => stripe.customers.retrieve(id),
    createCustomer: (profile, idempotencyKey) => stripe.customers.create({ email: profile.email, name: profile.company_name ?? undefined, metadata: { user_id: profile.id, cui: profile.cui ?? "" } }, { idempotencyKey }),
    createCheckout: (customerId, userId, priceId, origin, idempotencyKey) => stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId, client_reference_id: userId, line_items: [{ price: priceId, quantity: 1 }],
      tax_id_collection: { enabled: true }, billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
      subscription_data: { metadata: { user_id: userId } }, success_url: `${origin}/account?paid=1`, cancel_url: `${origin}/account?checkout=cancelled`,
      // Leave room for network latency above Stripe's 30-minute minimum.
      locale: "ro", expires_at: Math.floor(Date.now() / 1000) + 3600,
    }, { idempotencyKey }),
    createPortal: (customerId, origin) => stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/account`, locale: "ro" }),
    subscription: (id) => stripe.subscriptions.retrieve(id),
    checkout: (id) => stripe.checkout.sessions.retrieve(id),
    invoice: (id) => stripe.invoices.retrieve(id),
    event: (raw, signature, secret) => stripe.webhooks.constructEvent(raw, signature, secret) as unknown as StripeEvent,
  };
}
