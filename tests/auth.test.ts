import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmSchema, passwordSchema, requestOrigin, resetSchema, safeAuthDestination, signupSchema, siteOrigin, trustedOrigin } from "../src/lib/auth/validation";

test("Signup normalizes email and CUI, requires company details and explicit terms", () => {
  const valid = { email: " Owner@Example.com ", password: "a long strong password", company_name: " Test SRL ", cui: " ro 123456 ", terms: "on" };
  const parsed = signupSchema.parse(valid);
  assert.equal(parsed.email, "owner@example.com");
  assert.equal(parsed.cui, "RO123456");
  assert.equal(parsed.company_name, "Test SRL");
  assert.equal(signupSchema.safeParse({ ...valid, terms: undefined }).success, false);
  assert.equal(signupSchema.safeParse({ ...valid, terms: "false" }).success, false);
  assert.equal(signupSchema.safeParse({ ...valid, company_name: "" }).success, false);
  assert.equal(signupSchema.safeParse({ ...valid, cui: "<script>" }).success, false);
});

test("Reset validates both passwords without trimming password characters", () => {
  assert.equal(passwordSchema.safeParse("short").success, false);
  assert.equal(passwordSchema.parse(" a long password "), " a long password ");
  assert.equal(resetSchema.safeParse({ password: "long new password", confirm_password: "other password" }).success, false);
});

test("Auth redirects cannot escape the account/reset destinations", () => {
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/account?next=//evil.test", "/%2f%2fevil.test", null, "javascript:alert(1)"]) {
    assert.equal(safeAuthDestination(value), "/account");
  }
  assert.equal(safeAuthDestination("/reset-password"), "/reset-password");
});

test("Auth writes require a matching browser Origin", () => {
  assert.equal(trustedOrigin("https://declaut.test/api/auth/login", "https://declaut.test"), true);
  for (const origin of [null, "null", "https://evil.test", "https://declaut.test.evil.test", "http://declaut.test"]) {
    assert.equal(trustedOrigin("https://declaut.test/api/auth/login", origin), false);
  }
});

test("The browser Origin check preserves the real loopback Host", () => {
  const origin = requestOrigin("http://localhost:3100/api/auth/signup", "127.0.0.1:3100");
  assert.equal(origin, "http://127.0.0.1:3100");
  assert.equal(trustedOrigin(origin, "http://127.0.0.1:3100"), true);
  assert.throws(() => requestOrigin("https://declaut.test", "evil.test/path"));
});

test("Canonical email origin rejects credentials, insecure hosts and embedded paths", () => {
  assert.equal(siteOrigin("https://declaut.test/api/auth/signup"), "https://declaut.test");
  assert.equal(siteOrigin("https://preview.test", "https://declaut.test"), "https://declaut.test");
  assert.equal(siteOrigin("http://127.0.0.1:3100/api/auth/signup"), "http://127.0.0.1:3100");
  for (const url of ["http://public.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test?next=evil", "javascript:alert(1)"]) {
    assert.throws(() => siteOrigin("https://declaut.test", url));
  }
});

test("Confirmation accepts only email/signup/recovery token flows", () => {
  for (const type of ["email", "signup", "recovery"]) assert.equal(confirmSchema.safeParse({ type, token_hash: "a".repeat(64) }).success, true);
  for (const type of ["magiclink", "invite", "email_change", "anything"]) assert.equal(confirmSchema.safeParse({ type, token_hash: "a".repeat(64) }).success, false);
});
