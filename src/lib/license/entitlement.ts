import { z } from "zod";
import { LicenseError } from "./http";
import type { Entitlement } from "./types";

const resultSchema = z.array(z.object({
  plan: z.enum(["free", "pro", "blocked"]),
  pro_until: z.string().nullable(),
  device_limit_reached: z.boolean(),
})).length(1);

export function deviceEntitlement(data: unknown): Entitlement {
  const result = resultSchema.safeParse(data);
  if (!result.success) throw new LicenseError(503, "database_unavailable");
  const entitlement = result.data[0];
  if (entitlement.device_limit_reached) throw new LicenseError(409, "device_limit_reached");
  if (entitlement.plan === "blocked") throw new LicenseError(503, "database_unavailable");
  return { plan: entitlement.plan, pro_until: entitlement.pro_until };
}
