import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import { LicenseError } from "../license/http";
import { z } from "zod";

let auth: SupabaseClient | undefined;
let admin: SupabaseClient | undefined;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function clients() {
  const env = supabaseEnv();
  auth ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
  admin ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  return { auth, admin };
}

export async function authenticate(accessToken: string) {
  const { data, error } = await clients().auth.auth.getUser(accessToken);
  if (error) {
    if (!error.status || error.status >= 500 || error.status === 429) throw new LicenseError(503, "auth_unavailable");
    throw new LicenseError(401, "unauthorized");
  }
  if (!data.user) throw new LicenseError(401, "unauthorized");
  if (!data.user.email_confirmed_at || data.user.is_anonymous) throw new LicenseError(403, "email_confirmation_required");
  return { id: data.user.id };
}

const entitlementSchema = z.object({
  plan: z.enum(["free", "pro"]),
  device_limit_reached: z.boolean(),
  pro_until: z.string().nullable(),
});

export async function resolveEntitlement(userId: string, deviceId: string, deviceName: string) {
  const { data, error } = await clients().admin.rpc("resolve_device_license", {
    p_user_id: userId,
    p_device_id: deviceId,
    p_device_name: deviceName,
  });
  if (error) throw new LicenseError(503, "database_unavailable");
  const result = z.array(entitlementSchema).length(1).safeParse(data);
  if (!result.success) throw new LicenseError(503, "database_unavailable");
  return result.data[0];
}
