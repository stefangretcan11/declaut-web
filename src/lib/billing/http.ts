import { z } from "zod";
import { requestOrigin, siteOrigin, trustedOrigin } from "../auth/validation";
import { BillingError, type BillingConfig } from "./config";
import { validPrice } from "./snapshots";
import type { BillingStore, BillingUser, StripeGateway } from "./types";

export type BillingDependencies = {
  authenticate(): Promise<BillingUser>;
  config(): BillingConfig;
  store(): BillingStore;
  stripe(config: BillingConfig): StripeGateway;
  siteUrl?: string;
};

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie, Accept" };
const checkoutSchema = z.object({ interval: z.enum(["semiannual", "yearly"]) }).strict();

async function input(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new BillingError(413, "request_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  try {
    if (request.headers.get("content-type")?.includes("application/json")) return JSON.parse(bytes.toString("utf8"));
    return Object.fromEntries((await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData()).entries());
  } catch { throw new BillingError(400, "invalid_request"); }
}

function stripeUrl(value: string | null, host: string): string {
  if (!value) throw new BillingError(503, "billing_unavailable");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password) throw new BillingError(503, "billing_unavailable");
  return url.href;
}

export function createBillingHandler(action: "checkout" | "portal", deps: BillingDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const json = request.headers.get("accept")?.includes("application/json") || request.headers.get("content-type")?.includes("application/json");
    let base = new URL(request.url).origin;
    try {
      base = requestOrigin(request.url, request.headers.get("host"));
      if (!trustedOrigin(base, request.headers.get("origin"))) throw new BillingError(403, "invalid_origin");
      const user = await deps.authenticate();
      const config = deps.config();
      const stripe = deps.stripe(config);
      const store = deps.store();
      const profile = await store.getProfile(user.id);
      const origin = siteOrigin(base, deps.siteUrl);
      let url: string;
      if (action === "portal") {
        if (!profile.stripe_customer_id) throw new BillingError(409, "billing_customer_missing");
        const customer = z.object({ id: z.string(), deleted: z.boolean().optional(), metadata: z.record(z.string(), z.string()).optional() }).parse(await stripe.customer(profile.stripe_customer_id));
        if (customer.deleted || (customer.metadata?.user_id && customer.metadata.user_id !== user.id)) throw new BillingError(409, "billing_customer_mismatch");
        url = stripeUrl((await stripe.createPortal(profile.stripe_customer_id, origin)).url, "billing.stripe.com");
      } else {
        const parsed = checkoutSchema.safeParse(await input(request));
        if (!parsed.success) throw new BillingError(400, "invalid_request");
        const priceId = config.prices[parsed.data.interval];
        if (!validPrice(await stripe.price(priceId), parsed.data.interval)) throw new BillingError(503, "billing_price_mismatch");
        const reservation = await store.reserveCheckout(user.id, priceId);
        if (reservation.state === "existing") url = stripeUrl(reservation.url, "checkout.stripe.com");
        else {
          if (reservation.state !== "reserved") throw new BillingError(409, reservation.state === "subscription_exists" ? "subscription_exists" : "checkout_in_progress");
          try {
            let customerId = profile.stripe_customer_id;
            if (!customerId) {
              const created = await stripe.createCustomer(profile, `declaut-customer:test:${user.id}`);
              customerId = await store.bindCustomer(user.id, created.id);
            }
            const customer = z.object({ id: z.string(), deleted: z.boolean().optional(), metadata: z.record(z.string(), z.string()).optional() }).parse(await stripe.customer(customerId));
            if (customer.deleted || (customer.metadata?.user_id && customer.metadata.user_id !== user.id)) throw new BillingError(409, "billing_customer_mismatch");
            const session = await stripe.createCheckout(customerId, user.id, priceId, origin, `declaut-checkout:${reservation.token}`);
            url = stripeUrl(session.url, "checkout.stripe.com");
            if (!await store.finishCheckout(user.id, reservation.token, session.id, url, session.expires_at)) throw new BillingError(503, "checkout_in_progress");
          } catch (error) {
            await store.releaseCheckout(user.id, reservation.token).catch(() => undefined);
            throw error;
          }
        }
      }
      return json ? Response.json({ url }, { headers }) : new Response(null, { status: 303, headers: { ...headers, Location: url } });
    } catch (error) {
      const known = error instanceof BillingError;
      const status = known ? error.status : 503;
      const code = known ? error.code : "billing_unavailable";
      if (!json) {
        const destination = new URL(status === 401 ? "/login" : `/account?billing_error=${code}`, base);
        return new Response(null, { status: 303, headers: { ...headers, Location: destination.href } });
      }
      return Response.json({ error: { code } }, { status, headers: { ...headers, ...(status === 503 ? { "Retry-After": "30" } : {}) } });
    }
  };
}
