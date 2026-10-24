export type BillingInterval = "semiannual" | "yearly";
export class BillingError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export type BillingConfig = {
  secretKey: string;
  webhookSecret?: string;
  prices: Record<BillingInterval, string>;
  mode: "test";
};

export const PLAN_PRICES = {
  semiannual: { amount: 30000, currency: "ron", interval: "month", intervalCount: 6 },
  yearly: { amount: 50000, currency: "ron", interval: "year", intervalCount: 1 },
} as const;

export function billingReadiness(env: Record<string, string | undefined> = process.env) {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const mode = key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : "unconfigured";
  const semiannualConfigured = /^price_[A-Za-z0-9_]+$/.test(env.STRIPE_PRICE_SEMIANNUAL ?? "");
  const yearlyConfigured = /^price_[A-Za-z0-9_]+$/.test(env.STRIPE_PRICE_YEARLY ?? "");
  const distinct = env.STRIPE_PRICE_SEMIANNUAL !== env.STRIPE_PRICE_YEARLY;
  // Live money is deliberately unavailable until A6 fiscal invoicing is implemented.
  const checkoutReady = mode === "test" && semiannualConfigured && yearlyConfigured && distinct;
  return { checkoutReady, portalReady: mode === "test", webhookReady: checkoutReady && Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")), mode, semiannualConfigured, yearlyConfigured };
}

export function readBillingConfig(env: Record<string, string | undefined> = process.env, webhook = false, portal = false): BillingConfig {
  const readiness = billingReadiness(env);
  if ((portal ? !readiness.portalReady : !readiness.checkoutReady) || (webhook && !readiness.webhookReady)) throw new BillingError(503, "billing_unavailable");
  return {
    secretKey: env.STRIPE_SECRET_KEY!.trim(),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim(),
    prices: { semiannual: env.STRIPE_PRICE_SEMIANNUAL ?? "", yearly: env.STRIPE_PRICE_YEARLY ?? "" },
    mode: "test",
  };
}
