import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import { LicenseError } from "../license/http";
import { deviceEntitlement } from "../license/entitlement";
import { hasCurrentTerms } from "../auth/validation";

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
  if (process.env.LICENSE_ISSUER === "declaut-production") {
    const profile = await clients().admin.from("profiles").select("terms_version,terms_accepted_at").eq("id", data.user.id).single();
    if (profile.error || !profile.data) throw new LicenseError(503, "database_unavailable");
    if (!hasCurrentTerms(profile.data)) throw new LicenseError(403, "terms_acceptance_required");
  }
  return { id: data.user.id };
}

export async function acceptCurrentTerms(userId: string, version: string) {
  const { error } = await clients().admin.rpc("accept_account_terms", { p_user_id: userId, p_version: version });
  if (error) throw new Error("Terms acceptance unavailable");
}

export async function resolveEntitlement(userId: string, deviceId: string, deviceName: string) {
  const { data, error } = await clients().admin.rpc("resolve_device_license", {
    p_user_id: userId,
    p_device_id: deviceId,
    p_device_name: deviceName,
  });
  if (error) throw new LicenseError(503, "database_unavailable");
  return deviceEntitlement(data);
}
