import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDeployment, deploymentOrigin } from "../scripts/check-deployment.mjs";

const html = '<!doctype html><html lang="ro"><title>Declaut</title><form action="/api/auth/login"></form></html>';

function appResponse(path: string) {
  return path === "/api/license"
    ? Response.json({ error: { code: "unauthorized" } }, { status: 401, headers: { "Cache-Control": "no-store" } })
    : new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

test("Deployment origins require HTTPS, no credentials and an explicit origin", () => {
  assert.equal(deploymentOrigin("https://declaut.example/"), "https://declaut.example");
  for (const value of [undefined, "http://declaut.example", "https://user:pass@declaut.example", "https://declaut.example/login", "https://declaut.example?token=value", "https://declaut.example/#value", "javascript:alert(1)"]) {
    assert.throws(() => deploymentOrigin(value));
  }
  assert.throws(() => deploymentOrigin("http://127.0.0.1:3100"));
  assert.equal(deploymentOrigin("http://127.0.0.1:3100", { allowLocal: true }), "http://127.0.0.1:3100");
});

test("Healthy deployment checks all public routes without credentials or account writes", async () => {
  const seen: string[] = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    seen.push(path);
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "omit");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    if (path === "/api/license") {
      assert.equal(init?.method, "POST");
      assert.equal(JSON.parse(String(init?.body)).device_id, "deployment-health-check");
    } else assert.equal(init?.method, "GET");
    return appResponse(path);
  }) as typeof fetch;
  const result = await checkDeployment("https://declaut.example", { fetcher });
  assert.equal(result.length, 7);
  assert.equal(result.every((check) => check.ok), true);
  assert.deepEqual(seen.sort(), ["/", "/api/license", "/contact", "/descarcare", "/intrebari-frecvente", "/login", "/preturi"]);
});

test("A Vercel login redirect and generic protected 401 are failures", async () => {
  const fetcher = (async (input: URL | RequestInfo) => {
    const path = new URL(String(input)).pathname;
    if (path === "/login") return new Response("", { status: 302, headers: { Location: "https://vercel.com/sso-api?token=private" } });
    if (path === "/api/license") return Response.json({ message: "Protected by Vercel Authentication", error: { code: "401" } }, { status: 401 });
    return appResponse(path);
  }) as typeof fetch;
  const result = await checkDeployment("https://declaut.example", { fetcher, coreOnly: true });
  assert.equal(result.find((check) => check.path === "/login")?.ok, false);
  assert.equal(result.find((check) => check.path === "/api/license")?.ok, false);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("HTML login impostors, page errors and cacheable license errors are failures", async () => {
  const fetcher = (async (input: URL | RequestInfo) => {
    const path = new URL(String(input)).pathname;
    if (path === "/") return new Response("Missing page", { status: 404 });
    if (path === "/login") return new Response("<html>Sign in to a different service</html>", { headers: { "Content-Type": "text/html" } });
    return Response.json({ error: { code: "unauthorized" } }, { status: 401, headers: { "Cache-Control": "public, max-age=60" } });
  }) as typeof fetch;
  const result = await checkDeployment("https://declaut.example", { fetcher, coreOnly: true });
  assert.equal(result.every((check) => !check.ok), true);
});

test("Network failures report a controlled error without exposing response details", async () => {
  const fetcher = (async () => { throw new Error("internal request details and secrets"); }) as typeof fetch;
  const result = await checkDeployment("https://declaut.example", { fetcher, coreOnly: true });
  assert.equal(result.every((check) => !check.ok && check.status === 0), true);
  assert.equal(JSON.stringify(result).includes("secrets"), false);
});
