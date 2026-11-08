import staging from "../docs/track-b-public-config.json";
import production from "../docs/track-b-production-config.json";
import keySet from "../docs/license-public-keys.json";
import { deploymentOrigin } from "./check-deployment.mjs";

type PublicSmokeConfig = {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  apiBaseUrl: string | null;
  license: { issuer: string; audience: string };
};

// Validate the destination and pinned identity before creating any fixtures or
// sending a bearer token. Never reuse staging credentials to fill production gaps.
export function licenseSmokeConfig(
  environment: string,
  env: Record<string, string | undefined> = process.env,
  config: PublicSmokeConfig = environment === "staging" ? staging : production,
) {
  if (environment !== "staging" && environment !== "production") throw new Error("Use --environment=staging or --environment=production");
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  if (!config.supabaseUrl || !config.supabasePublishableKey || !config.apiBaseUrl) {
    throw new Error(`Complete docs/track-b-${environment === "production" ? "production" : "public"}-config.json with verified public configuration first`);
  }
  const supabaseUrl = deploymentOrigin(config.supabaseUrl);
  const configuredApi = deploymentOrigin(config.apiBaseUrl);
  if (required("LICENSE_ISSUER") !== config.license.issuer || required("LICENSE_AUDIENCE") !== config.license.audience) {
    throw new Error("Signing issuer/audience does not match the selected environment");
  }
  if (required("NEXT_PUBLIC_SUPABASE_URL") !== config.supabaseUrl || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") !== config.supabasePublishableKey) {
    throw new Error("Supabase configuration does not match the selected environment's public handoff");
  }
  const keyId = required("LICENSE_KEY_ID");
  const publicKey = keySet.keys.find((key) => key.environment === environment && key.kid === keyId);
  if (!publicKey || publicKey.issuer !== config.license.issuer || publicKey.audience !== config.license.audience) {
    throw new Error("Signing key ID does not match a pinned key for the selected environment");
  }
  const api = deploymentOrigin(env.LICENSE_API_URL ?? (environment === "staging" ? "http://127.0.0.1:3100" : configuredApi), { allowLocal: environment === "staging" });
  if (environment === "production" && api !== configuredApi) throw new Error("License API origin does not match the production public handoff");
  if (environment === "staging" && api === production.apiBaseUrl) throw new Error("Staging must not send access tokens to the production API");
  if (environment === "production" && (supabaseUrl === staging.supabaseUrl || [staging.apiBaseUrl, staging.stableApiBaseUrl].includes(api))) {
    throw new Error("Production must use a separate Supabase project and API origin");
  }
  return { api, supabaseUrl, publishableKey: config.supabasePublishableKey, serverKey: required("SUPABASE_SERVICE_ROLE_KEY"), issuer: config.license.issuer, audience: config.license.audience, keyId, publicKey };
}
