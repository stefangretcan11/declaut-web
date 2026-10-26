import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { importSPKI, jwtVerify } from "jose";
import type { LicenseResponse } from "../src/lib/license/types";

async function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
  const api = process.env.LICENSE_API_URL ?? "http://127.0.0.1:3100";
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), options);
  const client = createClient(url, required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), options);
  const publicKey = await importSPKI(await readFile(".keys/staging/public.pem", "utf8"), "EdDSA");
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const email = `license-smoke-${randomUUID()}@example.invalid`;
  let userId: string | undefined;
  let cleanupFailed = false;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { company_name: "License smoke test" } });
    if (created.error || !created.data.user) throw new Error(`Test account creation failed (${created.error?.code ?? "unknown"})`);
    userId = created.data.user.id;
    console.log("Temporary confirmed test account created (no email sent)");
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error("REST password sign-in failed");
    const accessToken = login.data.session.access_token;

    const license = async (device: string) => {
      const response = await fetch(`${api}/api/license`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ device_id: device, device_name: "Smoke test PC" }), signal: AbortSignal.timeout(15000) });
      if (response.status !== 200) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`License HTTP ${response.status}: ${body.error?.code ?? "unknown"}`);
      }
      const body = await response.json() as LicenseResponse;
      const { payload } = await jwtVerify(body.token, publicKey, { algorithms: ["EdDSA"], issuer: required("LICENSE_ISSUER"), audience: required("LICENSE_AUDIENCE") });
      assert.equal(payload.sub, userId); assert.equal(payload.device_id, device); assert.equal(payload.plan, body.plan);
      assert.equal(payload.exp, Date.parse(body.expires_at) / 1000);
      assert.equal(Object.hasOwn(body, "device_limit_reached"), false);
      if (body.plan === "free") assert.equal(payload.max_firms, 3);
      else assert.equal(Object.hasOwn(payload, "max_firms"), false);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return body;
    };

    assert.equal((await license("smoke-one")).plan, "free");
    console.log("Free license: signature, claims and expiry verified");

    const id = `sub_smoke_${randomUUID()}`;
    const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    const inserted = await admin.from("subscriptions").insert({ id, user_id: userId, status: "active", price_id: "price_smoke_only", current_period_start: new Date(Date.now() - 3600000).toISOString(), current_period_end: periodEnd });
    if (inserted.error) throw new Error(`Test subscription insertion failed (${inserted.error.code})`);
    assert.equal((await license("smoke-one")).plan, "pro");
    assert.equal((await license("smoke-two")).plan, "pro");
    const third = await license("smoke-three");
    assert.equal(third.plan, "pro");
    assert.equal((await license("smoke-four")).plan, "pro");
    console.log("Active subscription: all four devices receive signed, device-bound Pro licenses");

    let updated = await admin.from("subscriptions").update({ status: "past_due", current_period_start: new Date(Date.now() - 71 * 3600000).toISOString() }).eq("id", id);
    if (updated.error) throw new Error("Could not set grace-period fixture");
    const grace = await license("smoke-one");
    assert.equal(grace.plan, "pro"); assert.ok(Date.parse(grace.expires_at) <= Date.now() + 3600000);
    updated = await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 73 * 3600000).toISOString() }).eq("id", id);
    if (updated.error) throw new Error("Could not set expired-grace fixture");
    assert.equal((await license("smoke-one")).plan, "free");
    console.log("Past-due grace: Pro inside 72 hours; Free after 72 hours");

    const own = await client.from("profiles").select("id");
    assert.equal(own.error, null); assert.deepEqual(own.data, [{ id: userId }]);
    const forbidden = await client.from("subscriptions").update({ status: "active" }).eq("id", id).select("id");
    assert.ok(forbidden.error, "Authenticated client writes must be denied");
    console.log("Staging RLS: own profile readable, direct subscription writes denied");

    const invalid = await fetch(`${api}/api/license`, { method: "POST", headers: { Authorization: "Bearer invalid-token", "Content-Type": "application/json" }, body: JSON.stringify({ device_id: "invalid", device_name: "Invalid" }), signal: AbortSignal.timeout(15000) });
    assert.equal(invalid.status, 401);
    console.log("Invalid access token: rejected with 401");
  } finally {
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) { cleanupFailed = true; console.log("Test account cleanup failed; remove the license-smoke account in Supabase Auth"); }
      else console.log("Temporary account, subscription, and devices removed");
    }
  }
  if (cleanupFailed) throw new Error("Staging cleanup failed");
}

main().catch((error: unknown) => {
  // Deliberately omit raw SDK/network responses and assertion payloads.
  console.error(error instanceof assert.AssertionError ? "Staging assertion failed" : error instanceof Error ? error.message : "Staging test failed");
  process.exitCode = 1;
});
