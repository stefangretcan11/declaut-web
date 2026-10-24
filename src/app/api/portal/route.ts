import { createBillingHandler } from "@/lib/billing/http";
import { billingDependencies } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const POST = createBillingHandler("portal", billingDependencies(true));
