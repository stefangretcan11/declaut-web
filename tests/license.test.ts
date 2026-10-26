import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { createLicenseSigner } from "../src/lib/license/sign";
import { createLicenseHandler, LicenseError } from "../src/lib/license/http";
import type { Entitlement } from "../src/lib/license/types";

const keys = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const sign = createLicenseSigner({ privateKeyPem: keys.privateKey, keyId: "test-key", issuer: "declaut-staging", audience: "declaut-desktop" });
const now = new Date("2026-10-24T12:00:00Z");
const free: Entitlement = { plan: "free", pro_until: null };

test("Free license verifies with the public key and binds user, device, audience, issuer, expiry", async () => {
  const { token, expires_at } = await sign("user-1", "device-1", free, now);
  const publicKey = await importSPKI(keys.publicKey, "EdDSA");
  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    algorithms: ["EdDSA"], issuer: "declaut-staging", audience: "declaut-desktop", currentDate: now,
  });
  assert.equal(protectedHeader.kid, "test-key");
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.device_id, "device-1");
  assert.equal(payload.plan, "free");
  assert.equal(payload.max_firms, 3);
  assert.equal(payload.v, 1);
  assert.equal(expires_at, "2026-10-25T12:00:00.000Z");
  await assert.rejects(jwtVerify(token, publicKey, { audience: "other-app", currentDate: now }));
  await assert.rejects(jwtVerify(token, publicKey, { currentDate: new Date(expires_at) }));
  const other = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  await assert.rejects(jwtVerify(token, await importSPKI(other.publicKey, "EdDSA"), { currentDate: now }));
});

test("Pro token expiry cannot exceed the payment grace period or subscription end", async () => {
  const boundary = "2026-10-24T13:00:00Z";
  const { token, expires_at } = await sign("user-1", "device-1", { plan: "pro", pro_until: boundary }, now);
  assert.equal(expires_at, "2026-10-24T13:00:00.000Z");
  const { payload } = await jwtVerify(token, await importSPKI(keys.publicKey, "EdDSA"), { currentDate: now });
  assert.equal(payload.plan, "pro");
  assert.equal(payload.device_id, "device-1");
  assert.equal(Object.hasOwn(payload, "max_firms"), false, "Free's firm cap must not apply to Pro");
  await assert.rejects(sign("user-1", "device-1", { ...free, plan: "pro", pro_until: now.toISOString() }, now));
});

function request(body: unknown = { device_id: "desktop-1", device_name: "Office PC" }, token = "access-token") {
  return new Request("https://example.com/api/license", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

test("HTTP handler uses the verified identity and omits the removed device-limit flag", async () => {
  const handler = createLicenseHandler({
    authenticate: async (token) => { assert.equal(token, "access-token"); return { id: "verified-user" }; },
    resolve: async (user, device, name) => {
      assert.equal(user, "verified-user"); assert.equal(device, "desktop-1"); assert.equal(name, "Office PC");
      return free;
    },
    sign: (user, device, entitlement) => sign(user, device, entitlement, now),
    release: async () => { throw new Error("GitHub unavailable"); },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.plan, "free"); assert.equal(Object.hasOwn(result, "device_limit_reached"), false);
  assert.equal(result.download_url, null); assert.equal(result.latest_version, null);
  const { payload } = await jwtVerify(result.token, await importSPKI(keys.publicKey, "EdDSA"), { currentDate: now });
  assert.equal(payload.plan, "free"); assert.equal(payload.sub, "verified-user");
});

test("HTTP handler issues device-bound Pro tokens on every registered PC", async () => {
  const handler = createLicenseHandler({
    authenticate: async () => ({ id: "verified-user" }),
    resolve: async () => ({ plan: "pro", pro_until: "2026-11-24T12:00:00Z" }),
    sign: (user, device, entitlement) => sign(user, device, entitlement, now),
    release: async () => ({ latest_version: null, download_url: null }),
  });
  for (const device of ["first", "second", "third", "fourth"]) {
    const response = await handler(request({ device_id: device, device_name: "Office PC" }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.plan, "pro");
    assert.equal(Object.hasOwn(result, "device_limit_reached"), false);
    const { payload } = await jwtVerify(result.token, await importSPKI(keys.publicKey, "EdDSA"), { currentDate: now });
    assert.equal(payload.plan, "pro");
    assert.equal(payload.device_id, device);
  }
});

test("Invalid requests never authenticate or touch the database", async () => {
  const unexpected = async (): Promise<never> => { throw new Error("Must not be called"); };
  const handler = createLicenseHandler({ authenticate: unexpected, resolve: unexpected, sign: unexpected, release: unexpected });
  assert.equal((await handler(request(undefined, ""))).status, 401);
  assert.equal((await handler(request({ device_id: "abc", device_name: "PC", user_id: "victim" }))).status, 400);
  assert.equal((await handler(request({ device_id: "../abc", device_name: "PC" }))).status, 400);
  assert.equal((await handler(request({ device_id: "abc", device_name: "x".repeat(5000) }))).status, 413);
  assert.equal((await handler(new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await handler(new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer test" }, body: "{}" }))).status, 415);
});

test("Auth failures issue no license and expose no internals", async () => {
  for (const error of [new LicenseError(401, "unauthorized"), new LicenseError(403, "email_confirmation_required"), new Error("private secret details")]) {
    const handler = createLicenseHandler({
      authenticate: async () => { throw error; },
      resolve: async () => { throw new Error("Must not resolve"); },
      sign: async () => { throw new Error("Must not sign"); },
      release: async () => ({ latest_version: null, download_url: null }),
    });
    const response = await handler(request());
    assert.equal(response.status, error instanceof LicenseError ? error.status : 503);
    assert.equal((await response.text()).includes("private secret"), false);
  }
});
