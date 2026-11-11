import assert from "node:assert/strict";
import { test } from "node:test";
import { createInstallerDownloadHandler, INSTALLER_DOWNLOAD_PATH } from "../src/lib/installer-download";
import type { ReleaseInfo } from "../src/lib/license/types";

const repo = "example/releases";
const source = "https://github.com/example/releases/releases/download/v1.0.0/declaut-setup.exe";
const release: ReleaseInfo = { latest_version: "1.0.0", download_url: source };
const request = (init?: RequestInit) => new Request(`https://declaut.test${INSTALLER_DOWNLOAD_PATH}`, init);
const handler = (fetcher: typeof fetch, metadata = release) => createInstallerDownloadHandler({ repo, release: async () => metadata, fetcher });

test("Installer bytes stream before the full file arrives, without exposing source headers or forwarding visitor credentials", { timeout: 2000 }, async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(new TextEncoder().encode("MZ")); } });
  const fetcher = (async (url, options) => {
    assert.equal(url, source);
    assert.equal(options?.redirect, "follow");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "omit");
    const headers = new Headers(options?.headers);
    assert.equal(headers.has("cookie"), false);
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.get("accept-encoding"), "identity");
    return new Response(body, { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": "4", "Accept-Ranges": "bytes", ETag: '"fixture"',
      Location: source, Link: `<${source}>`, "X-Upstream-Repository": repo,
      "Content-Disposition": `attachment; filename="${repo}.exe"`,
    } });
  }) as typeof fetch;
  const response = await handler(fetcher)(request({ headers: { Cookie: "private-cookie", Authorization: "Bearer private-token" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="declaut-setup.exe"');
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("etag"), '"fixture"');
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("link"), false);
  assert.equal(response.headers.has("x-upstream-repository"), false);
  assert.equal(JSON.stringify([...response.headers]).includes(repo), false);
  const reader = response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "MZ");
  controller.enqueue(new TextEncoder().encode("ok"));
  controller.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "ok");
  assert.equal((await reader.read()).done, true);
});

test("HEAD retrieves installer headers without a response body", async () => {
  const fetcher = (async (_url, options) => {
    assert.equal(options?.method, "HEAD");
    return new Response(null, { headers: { "Content-Type": "application/octet-stream", "Content-Length": "71041584" } });
  }) as typeof fetch;
  const response = await handler(fetcher)(request({ method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "71041584");
  assert.equal(response.body, null);
});

test("Single byte ranges and validators support resumed downloads", async () => {
  const fetcher = (async (_url, options) => {
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("range"), "bytes=2-3");
    assert.equal(headers.get("if-range"), '"fixture"');
    return new Response("ok", { status: 206, headers: { "Content-Type": "application/octet-stream", "Content-Length": "2", "Content-Range": "bytes 2-3/4", "Accept-Ranges": "bytes" } });
  }) as typeof fetch;
  const response = await handler(fetcher)(request({ headers: { Range: "bytes=2-3", "If-Range": '"fixture"' } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 2-3/4");
  assert.equal(response.headers.get("content-length"), "2");
  assert.equal(await response.text(), "ok");
});

test("Unsatisfiable ranges preserve the file size without forwarding an upstream error body", async () => {
  const fetcher = (async () => new Response(`Error at ${source}`, { status: 416, headers: { "Content-Range": "bytes */4", Location: source } })) as typeof fetch;
  const response = await handler(fetcher)(request({ headers: { Range: "bytes=20-30" } }));
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */4");
  assert.equal(response.headers.has("location"), false);
  assert.equal(await response.text(), "");
});

test("Invalid or multiple byte ranges are rejected before contacting the provider", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; throw new Error("Must not fetch"); }) as typeof fetch;
  for (const range of ["bytes=", "items=0-1", "bytes=0-1,4-5", `bytes=${"1".repeat(130)}-`]) {
    assert.equal((await handler(fetcher)(request({ headers: { Range: range } }))).status, 416);
  }
  assert.equal(calls, 0);
});

test("Only the configured repository's HTTPS installer URLs can be fetched", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; throw new Error("Must not fetch"); }) as typeof fetch;
  for (const url of [null, "invalid", "http://github.com/example/releases/releases/download/v1/setup.exe", "https://evil.example/setup.exe", "https://github.com/other/repo/releases/download/v1/setup.exe", "https://user:pass@github.com/example/releases/releases/download/v1/setup.exe", "https://github.com:444/example/releases/releases/download/v1/setup.exe"]) {
    const response = await handler(fetcher, { latest_version: "1.0.0", download_url: url })(request());
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
});

test("Provider failures, redirects and unexpected HTML return a controlled retryable message without the repository URL", async () => {
  for (const upstream of [
    () => { throw new Error(source); },
    () => new Response(source, { status: 404, headers: { Location: source } }),
    () => new Response(null, { status: 302, headers: { Location: source } }),
    () => new Response(`<html>${source}</html>`, { headers: { "Content-Type": "text/html" } }),
    () => new Response(null),
  ]) {
    const fetcher = (async () => upstream()) as typeof fetch;
    const response = await handler(fetcher)(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.has("location"), false);
    const text = await response.text();
    assert.match(text, /Descărcarea nu este disponibilă/);
    assert.equal(text.includes(source), false);
  }
});

test("Release metadata errors remain private and HEAD error responses have no body", async () => {
  const download = createInstallerDownloadHandler({ repo, release: async () => { throw new Error(source); } });
  const response = await download(request({ method: "HEAD" }));
  assert.equal(response.status, 503);
  assert.equal(response.body, null);
  assert.equal(response.headers.has("location"), false);
});
