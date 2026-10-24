import { createWebhookHandler } from "@/lib/billing/webhook";
import { readBillingConfig } from "@/lib/billing/config";
import { billingStore, stripeGateway } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const POST = createWebhookHandler({ config: () => readBillingConfig(process.env, true), store: billingStore, stripe: stripeGateway });
