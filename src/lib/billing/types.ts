import type { BillingInterval } from "./config";

export type BillingUser = { id: string; email: string };
export type BillingProfile = { id: string; email: string; company_name: string | null; cui: string | null; stripe_customer_id: string | null };
export type SubscriptionSnapshot = {
  id: string;
  customer_id: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";
  price_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  is_pro: boolean;
};
export type InvoiceSnapshot = {
  id: string;
  customer_id: string;
  subscription_id: string;
  status: string;
  currency: string;
  amount_paid: number;
  stripe_invoice_number: string | null;
  stripe_hosted_invoice_url: string | null;
  stripe_invoice_pdf_url: string | null;
  created_at: string;
};
export type StripeEvent = { id: string; type: string; livemode: boolean; data: { object: { id: string } } };
export type CheckoutReservation = { state: "reserved"; token: string } | { state: "existing"; url: string } | { state: "busy" | "subscription_exists" };

export interface BillingStore {
  getProfile(userId: string): Promise<BillingProfile>;
  bindCustomer(userId: string, customerId: string): Promise<string>;
  reserveCheckout(userId: string, priceId: string): Promise<CheckoutReservation>;
  finishCheckout(userId: string, token: string, sessionId: string, url: string, expiresAt: number): Promise<boolean>;
  releaseCheckout(userId: string, token: string): Promise<void>;
  eventProcessed(eventId: string): Promise<boolean>;
  customerOwner(customerId: string): Promise<string | null>;
  beginSync(subscriptionId: string): Promise<number>;
  applySync(generation: number, subscription: SubscriptionSnapshot, invoice?: InvoiceSnapshot): Promise<boolean>;
  completeEvent(eventId: string, type: string): Promise<void>;
}

export interface StripeGateway {
  price(id: string): Promise<unknown>;
  customer(id: string): Promise<unknown>;
  createCustomer(profile: BillingProfile, idempotencyKey: string): Promise<{ id: string }>;
  createCheckout(customerId: string, userId: string, priceId: string, origin: string, idempotencyKey: string): Promise<{ id: string; url: string | null; expires_at: number }>;
  createPortal(customerId: string, origin: string): Promise<{ url: string }>;
  subscription(id: string): Promise<unknown>;
  checkout(id: string): Promise<unknown>;
  invoice(id: string): Promise<unknown>;
  event(raw: string, signature: string, secret: string): StripeEvent;
}

export type CheckoutInput = { interval: BillingInterval };
