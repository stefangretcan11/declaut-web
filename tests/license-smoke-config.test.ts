import assert from "node:assert/strict";
import { test } from "node:test";
import staging from "../docs/track-b-public-config.json";
import production from "../docs/track-b-production-config.json";
import keys from "../docs/license-public-keys.json";
import { licenseSmokeConfig } from "../scripts/license-smoke-config";

const isolatedStaging = { ...staging, supabaseUrl: "https://isolated-staging.supabase.example", supabasePublishableKey: "sb_publishable_staging_fixture" };

function stagingEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: isolatedStaging.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: isolatedStaging.supabasePublishableKey,
    SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
    LICENSE_ISSUER: staging.license.issuer,
    LICENSE_AUDIENCE: staging.license.audience,
    LICENSE_KEY_ID: staging.license.publicKey.kid,
  };
}

test("License smoke checks pin the environment's public identity without requiring a private signing key", () => {
  const local = licenseSmokeConfig("staging", stagingEnv(), isolatedStaging);
  assert.equal(local.api, "http://127.0.0.1:3100");
  assert.equal(local.publicKey.x, staging.license.publicKey.x);
  assert.equal(licenseSmokeConfig("staging", { ...stagingEnv(), LICENSE_API_URL: staging.stableApiBaseUrl }, isolatedStaging).api, staging.stableApiBaseUrl);
  // An explicitly supplied staging preview can be checked before it replaces
  // the verified reference URL in the handoff.
  assert.equal(licenseSmokeConfig("staging", { ...stagingEnv(), LICENSE_API_URL: "https://new-staging.example" }, isolatedStaging).api, "https://new-staging.example");
});

test("License smoke checks reject mixed environments and malformed API origins before using credentials", () => {
  for (const override of [
    { LICENSE_ISSUER: "declaut-production" },
    { LICENSE_AUDIENCE: "another-app" },
    { LICENSE_KEY_ID: production.license.publicKey.kid },
    { NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "server-secret" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    ...["http://remote.example", "https://user:pass@remote.example", "https://remote.example/api/license", "https://remote.example?token=value"].map((LICENSE_API_URL) => ({ LICENSE_API_URL })),
  ]) assert.throws(() => licenseSmokeConfig("staging", { ...stagingEnv(), ...override }, isolatedStaging));
  assert.throws(() => licenseSmokeConfig("unknown", stagingEnv()));
  assert.throws(() => licenseSmokeConfig("production", stagingEnv()));
});

test("The production handoff pins the production key and the shared three-firm Free policy", () => {
  const key = keys.keys.find((key) => key.environment === "production" && key.kid === production.license.publicKey.kid);
  assert.equal(key?.x, production.license.publicKey.x);
  assert.equal(key?.issuer, production.license.issuer);
  assert.equal(key?.audience, production.license.audience);
  assert.equal(production.plans.freeMaxFirms, 3);
  assert.equal(production.plans.maxDevicesPerAccount, 1);
});

test("Production smoke checks use the production key and the exact provisioned HTTPS origin", () => {
  // Synthetic provisioned configuration; this test makes no network requests.
  const config = { ...production, supabaseProjectPromotedFromStaging: false, apiBaseUrl: "https://declaut-production.example", supabaseUrl: "https://production.supabase.example", supabasePublishableKey: "sb_publishable_production_fixture" };
  const env = { ...stagingEnv(), NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.supabasePublishableKey, LICENSE_ISSUER: config.license.issuer, LICENSE_KEY_ID: config.license.publicKey.kid };
  const parsed = licenseSmokeConfig("production", env, config);
  assert.equal(parsed.api, config.apiBaseUrl);
  assert.equal(parsed.publicKey.x, config.license.publicKey.x);
  for (const api of [staging.stableApiBaseUrl, "http://127.0.0.1:3100", "https://another-production.example"]) {
    assert.throws(() => licenseSmokeConfig("production", { ...env, LICENSE_API_URL: api }, config));
  }
  for (const override of [
    { apiBaseUrl: staging.stableApiBaseUrl },
    { supabaseUrl: staging.supabaseUrl },
    { supabaseUrl: "http://insecure.example" },
  ]) {
    const mixed = { ...config, ...override };
    assert.throws(() => licenseSmokeConfig("production", { ...env, NEXT_PUBLIC_SUPABASE_URL: mixed.supabaseUrl }, mixed));
  }
});


test("The owner-approved project promotion permits production and disables staging fixtures", () => {
  const env = { ...stagingEnv(), NEXT_PUBLIC_SUPABASE_URL: production.supabaseUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: production.supabasePublishableKey, LICENSE_ISSUER: production.license.issuer, LICENSE_KEY_ID: production.license.publicKey.kid };
  assert.equal(licenseSmokeConfig("production", env).api, production.apiBaseUrl);
  assert.throws(() => licenseSmokeConfig("staging", { ...env, LICENSE_ISSUER: staging.license.issuer, LICENSE_KEY_ID: staging.license.publicKey.kid }));
});
