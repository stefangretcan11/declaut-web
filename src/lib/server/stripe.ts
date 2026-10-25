import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sessionClient } from "./session";
import { supabaseEnv } from "./env";
import { BillingError, readBillingConfig, type BillingConfig } from "../billing/config";
import { createStripeGateway } from "../billing/stripe-adapter";
import type { BillingDependencies } from "../billing/http";
import type { BillingProfile, BillingStore, CheckoutReservation, StripeEvent, StripeGateway } from "../billing/types";

let admin: SupabaseClient | undefined;
function database() {
  if (!admin) {
    const env = supabaseEnv();
    admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return admin;
}
function dbError(error: unknown) { if (error) throw new BillingError(503, "billing_database_unavailable"); }

export function billingStore(): BillingStore {
  const db = database();
  return {
    async getProfile(userId) {
      const { data, error } = await db.from("profiles").select("id,email,company_name,cui,stripe_customer_id").eq("id", userId).single();
      dbError(error);
      if (!data) throw new BillingError(503, "billing_database_unavailable");
      return data as BillingProfile;
    },
    async bindCustomer(userId, customerId) {
      const { data, error } = await db.rpc("bind_billing_customer", { p_user_id: userId, p_customer_id: customerId });
      dbError(error); return z.string().parse(data);
    },
    async reserveCheckout(userId, priceId) {
      const { data, error } = await db.rpc("reserve_billing_checkout", { p_user_id: userId, p_price_id: priceId });
      dbError(error);
      return z.discriminatedUnion("state", [z.object({ state: z.literal("reserved"), token: z.string() }), z.object({ state: z.literal("existing"), url: z.string() }), z.object({ state: z.enum(["busy", "subscription_exists"]) })]).parse(data) as CheckoutReservation;
    },
    async finishCheckout(userId, token, sessionId, url, expiresAt) {
      const { data, error } = await db.rpc("finish_billing_checkout", { p_user_id: userId, p_token: token, p_session_id: sessionId, p_url: url, p_expires_at: new Date(expiresAt * 1000).toISOString() });
      dbError(error); return data === true;
    },
    async releaseCheckout(userId, token) { const { error } = await db.rpc("release_billing_checkout", { p_user_id: userId, p_token: token }); dbError(error); },
    async eventProcessed(eventId) { const { data, error } = await db.from("billing_webhook_events").select("id").eq("id", eventId).maybeSingle(); dbError(error); return Boolean(data); },
    async customerOwner(customerId) { const { data, error } = await db.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle(); dbError(error); return data?.id ?? null; },
    async beginSync(subscriptionId) { const { data, error } = await db.rpc("begin_billing_sync", { p_subscription_id: subscriptionId }); dbError(error); const value = Number(data); if (!Number.isSafeInteger(value) || value < 1) throw new BillingError(503, "billing_database_unavailable"); return value; },
    async applySync(generation, subscription, invoice) { const { data, error } = await db.rpc("apply_billing_sync", { p_generation: generation, p_subscription: subscription, p_invoice: invoice ?? null }); dbError(error); return data === true; },
    async completeEvent(eventId, type) { const { error } = await db.from("billing_webhook_events").upsert({ id: eventId, event_type: type }, { onConflict: "id" }); dbError(error); },
  };
}

export const stripeGateway = createStripeGateway;

export function billingDependencies(portal = false): BillingDependencies {
  return {
    async authenticate() {
      const session = await sessionClient();
      const { data, error } = await session.auth.getUser();
      if (error || !data.user) throw new BillingError(401, "unauthorized");
      if (!data.user.email_confirmed_at || data.user.is_anonymous || !data.user.email) throw new BillingError(403, "email_confirmation_required");
      return { id: data.user.id, email: data.user.email };
    },
    config: () => readBillingConfig(process.env, false, portal),
    store: billingStore, stripe: stripeGateway, siteUrl: process.env.SITE_URL,
  };
}
