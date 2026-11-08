import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { importJWK, jwtVerify } from "jose";
import type { LicenseResponse } from "../src/lib/license/types";
import { FREE_MAX_FIRMS } from "../src/lib/license/plans";
import { licenseSmokeConfig } from "./license-smoke-config";

let step = "configuration";

async function main() {
  const environment = process.argv.find((arg) => arg.startsWith("--environment="))?.split("=")[1] ?? "staging";
  const config = licenseSmokeConfig(environment);
  const api = config.api;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(config.supabaseUrl, config.serverKey, options);
  const client = createClient(config.supabaseUrl, config.publishableKey, options);
  const publicKey = await importJWK(config.publicKey, "EdDSA");
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const email = `license-smoke-${randomUUID()}@example.invalid`;
  let userId: string | undefined;
  let cleanupFailed = false;
  try {
    step = "temporary account creation";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { company_name: "License smoke test" } });
    if (created.error || !created.data.user) throw new Error(`Test account creation failed (${created.error?.code ?? "unknown"})`);
    userId = created.data.user.id;
    console.log("Temporary confirmed test account created (no email sent)");
    step = "REST password sign-in";
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error("REST password sign-in failed");
    const accessToken = login.data.session.access_token;

    const license = async (device: string, expectedPlan: "free" | "pro", expectedProUntil?: string) => {
      step = `${expectedPlan} license on ${device}`;
      const response = await fetch(`${api}/api/license`, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: device, device_name: "Smoke test PC" }), signal: AbortSignal.timeout(15000) });
      if (response.status !== 200) {
        const body = await response.json().catch(() => ({}));
        const code = body.error?.code;
        throw new Error(`License HTTP ${response.status}${typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? `: ${code}` : ""}`);
      }
      const body = await response.json() as LicenseResponse;
      const { payload, protectedHeader } = await jwtVerify(body.token, publicKey, { algorithms: ["EdDSA"], issuer: config.issuer, audience: config.audience });
      assert.equal(protectedHeader.kid, config.keyId);
      assert.equal(payload.v, 1);
      assert.equal(payload.sub, userId); assert.equal(payload.device_id, device); assert.equal(payload.plan, body.plan);
      assert.equal(payload.plan, expectedPlan);
      assert.equal(payload.exp, Date.parse(body.expires_at) / 1000);
      assert.equal(typeof payload.iat, "number");
      assert.ok(payload.exp! > payload.iat! && payload.exp! - payload.iat! <= 86400);
      assert.equal(Object.hasOwn(body, "device_limit_reached"), false);
      if (body.plan === "free") {
        assert.equal(payload.max_firms, FREE_MAX_FIRMS);
        assert.equal(Object.hasOwn(payload, "pro_until"), false);
      } else {
        assert.equal(Object.hasOwn(payload, "max_firms"), false);
        assert.equal(payload.pro_until, expectedProUntil);
        assert.ok(payload.exp! <= Date.parse(expectedProUntil!) / 1000);
      }
      assert.equal(response.headers.get("cache-control"), "no-store");
      return body;
    };

    const blockedDevice = async (device: string) => {
      step = `second-device rejection on ${device}`;
      const response = await fetch(`${api}/api/license`, { method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: device, device_name: "Second smoke test PC" }), signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: { code: "device_limit_reached" } });
      assert.equal(response.headers.get("cache-control"), "no-store");
    };

    await license("smoke-one", "free");
    await blockedDevice("smoke-two");
    console.log("Free license: signature, three-firm cap and second-device rejection verified");

    const id = `sub_smoke_${randomUUID()}`;
    const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    step = "Pro subscription fixture";
    const inserted = await admin.from("subscriptions").insert({ id, user_id: userId, status: "active", price_id: "price_smoke_only", is_pro: true, current_period_start: new Date(Date.now() - 3600000).toISOString(), current_period_end: periodEnd });
    if (inserted.error) throw new Error(`Test subscription insertion failed (${inserted.error.code})`);
    for (const device of ["smoke-one", "smoke-two"]) {
      step = `database single-device policy on ${device}`;
      const resolved: { data: { plan: string; device_limit_reached: boolean }[] | null; error: unknown } = await admin.rpc("resolve_device_license", { p_user_id: userId, p_device_id: device, p_device_name: "Smoke test PC" });
      if (resolved.error) throw new Error("Database device-policy check failed");
      assert.ok(resolved.data && resolved.data.length === 1);
      assert.equal(resolved.data[0].plan, device === "smoke-one" ? "pro" : "blocked");
      assert.equal(resolved.data[0].device_limit_reached, device !== "smoke-one");
    }
    await license("smoke-one", "pro", periodEnd);
    await blockedDevice("smoke-two");
    console.log("Active subscription: only the active device receives a signed Pro license");

    step = "active device removal";
    const currentDevice = await admin.from("devices").select("id").eq("user_id", userId).eq("is_active", true).single();
    if (currentDevice.error || !currentDevice.data) throw new Error("Active device lookup failed; apply the single-device migration");
    const removed = await admin.rpc("remove_own_device", { p_user_id: userId, p_device_row_id: currentDevice.data.id });
    if (removed.error || removed.data !== true) throw new Error("Active device removal failed");
    await license("smoke-two", "pro", periodEnd);
    await blockedDevice("smoke-one");
    console.log("Device transfer: removing the active PC frees the one account slot");

    step = "trial subscription fixture";
    const trialEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    const trial = await admin.from("subscriptions").update({ status: "trialing", current_period_start: new Date(Date.now() - 3600000).toISOString(), current_period_end: trialEnd }).eq("id", id);
    if (trial.error) throw new Error("Could not set trial fixture");
    await license("smoke-two", "pro", trialEnd);
    await blockedDevice("smoke-one");

    step = "payment-grace fixture";
    const graceStart = Date.now() - 71 * 3600000;
    let updated = await admin.from("subscriptions").update({ status: "past_due", current_period_start: new Date(graceStart).toISOString(), current_period_end: periodEnd }).eq("id", id);
    if (updated.error) throw new Error("Could not set grace-period fixture");
    const grace = await license("smoke-two", "pro", new Date(graceStart + 72 * 3600000).toISOString());
    assert.ok(Date.parse(grace.expires_at) <= Date.now() + 3600000);
    step = "expired payment-grace fixture";
    updated = await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 73 * 3600000).toISOString() }).eq("id", id);
    if (updated.error) throw new Error("Could not set expired-grace fixture");
    await license("smoke-two", "free");
    await blockedDevice("smoke-one");
    console.log("Past-due grace: Pro inside 72 hours; Free after 72 hours");

    step = "owner-only row access";
    const own = await client.from("profiles").select("id");
    assert.equal(own.error, null); assert.deepEqual(own.data, [{ id: userId }]);
    const forbidden = await client.from("subscriptions").update({ status: "active" }).eq("id", id).select("id");
    assert.ok(forbidden.error, "Authenticated client writes must be denied");
    console.log("RLS: own profile readable, direct subscription writes denied");

    step = "invalid-token rejection";
    const invalid = await fetch(`${api}/api/license`, { method: "POST", redirect: "manual", headers: { Authorization: "Bearer invalid-token", "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "invalid", device_name: "Invalid" }), signal: AbortSignal.timeout(15000) });
    assert.equal(invalid.status, 401);
    console.log("Invalid access token: rejected with 401");
  } finally {
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) { cleanupFailed = true; console.log("Test account cleanup failed; remove the license-smoke account in Supabase Auth"); }
      else console.log("Temporary account, subscription, and devices removed");
    }
  }
  if (cleanupFailed) throw new Error("License test cleanup failed");
}

main().catch((error: unknown) => {
  // Deliberately omit raw SDK/network responses and assertion payloads.
  console.error(error instanceof assert.AssertionError ? `License acceptance failed: ${step}` : error instanceof Error ? error.message : "License test failed");
  process.exitCode = 1;
});
