import { isProductionProject, productionConfigIssues, productionSiteMatches } from "../production-config";

export type BillingInterval = "semiannual" | "yearly";
export const PRO_TRIAL_DAYS = 30;
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;
export function stripeKeyMode(key: string | undefined): "test" | "live" | "unconfigured" {
  const value = key?.trim() ?? "";
  if (/^(?:sk|rk)_test_/.test(value)) return "test";
  if (/^(?:sk|rk)_live_/.test(value)) return "live";
  return "unconfigured";
}
export class BillingError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export type BillingConfig = {
  secretKey: string;
  webhookSecret?: string;
  prices: Record<BillingInterval, string>;
  mode: "test" | "live";
  portalConfigurationId?: string;
};

export const PLAN_PRICES = {
  semiannual: { amount: 30000, currency: "ron", interval: "month", intervalCount: 6 },
  yearly: { amount: 50000, currency: "ron", interval: "year", intervalCount: 1 },
} as const;

export function billingReadiness(env: Record<string, string | undefined> = process.env) {
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  const semiannualConfigured = /^price_[A-Za-z0-9_]+$/.test(env.STRIPE_PRICE_SEMIANNUAL ?? "");
  const yearlyConfigured = /^price_[A-Za-z0-9_]+$/.test(env.STRIPE_PRICE_YEARLY ?? "");
  const distinct = env.STRIPE_PRICE_SEMIANNUAL !== env.STRIPE_PRICE_YEARLY;
  const portalConfigured = /^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID ?? "");
  const liveReady = mode === "live" && productionConfigIssues(env).length === 0 && portalConfigured && env.BILLING_LIVE_ENABLED === "true";
  const testEnabled = mode === "test" && env.LICENSE_ISSUER !== "declaut-production" && !isProductionProject(env);
  const enabled = testEnabled || liveReady;
  const reconciliationEnabled = testEnabled || (mode === "live" && productionSiteMatches(env));
  const checkoutReady = enabled && semiannualConfigured && yearlyConfigured && distinct && (mode !== "live" || Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")));
  return { checkoutReady, portalReady: reconciliationEnabled && (mode !== "live" || portalConfigured), webhookReady: reconciliationEnabled && semiannualConfigured && yearlyConfigured && distinct && Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")), mode, semiannualConfigured, yearlyConfigured, liveReady };
}

export function readBillingConfig(env: Record<string, string | undefined> = process.env, webhook = false, portal = false): BillingConfig {
  const readiness = billingReadiness(env);
  if (!(webhook ? readiness.webhookReady : portal ? readiness.portalReady : readiness.checkoutReady)) throw new BillingError(503, "billing_unavailable");
  return {
    secretKey: env.STRIPE_SECRET_KEY!.trim(),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim(),
    prices: { semiannual: env.STRIPE_PRICE_SEMIANNUAL ?? "", yearly: env.STRIPE_PRICE_YEARLY ?? "" },
    mode: readiness.mode === "live" ? "live" : "test",
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID,
  };
}
