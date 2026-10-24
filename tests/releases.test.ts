import assert from "node:assert/strict";
import { test } from "node:test";
import { createReleaseReader } from "../src/lib/releases";

const release = { tag_name: "v1.2.3", draft: false, prerelease: false, assets: [{ name: "Declaut-Setup.exe", browser_download_url: "https://github.com/example/releases/releases/download/v1.2.3/Declaut-Setup.exe" }] };

test("Release metadata is cached for an hour; last success survives GitHub failure", async () => {
  let now = 1;
  let calls = 0;
  const fetcher = (async () => { calls++; return calls === 1 ? Response.json(release) : new Response("", { status: 503 }); }) as typeof fetch;
  const read = createReleaseReader("example/releases", undefined, fetcher, () => now);
  assert.deepEqual(await read(), { latest_version: "1.2.3", download_url: release.assets[0].browser_download_url });
  await read(); assert.equal(calls, 1);
  now += 3_600_001;
  assert.equal((await read()).latest_version, "1.2.3"); assert.equal(calls, 2);
  await read(); assert.equal(calls, 2);
});

test("Missing repo and unavailable releases produce nullable metadata", async () => {
  const noFetch = (async () => { throw new Error("Must not fetch"); }) as typeof fetch;
  assert.deepEqual(await createReleaseReader(undefined, undefined, noFetch)(), { latest_version: null, download_url: null });
  assert.deepEqual(await createReleaseReader("example/releases", undefined, noFetch)(), { latest_version: null, download_url: null });
});

test("Ambiguous installers require an explicit asset name", async () => {
  const data = { ...release, assets: [...release.assets, { name: "Declaut-arm64.exe", browser_download_url: "https://github.com/example/releases/releases/download/v1.2.3/Declaut-arm64.exe" }] };
  const fetcher = (async () => Response.json(data)) as typeof fetch;
  assert.equal((await createReleaseReader("example/releases", undefined, fetcher)()).download_url, null);
  assert.equal((await createReleaseReader("example/releases", "Declaut-Setup.exe", fetcher)()).download_url, release.assets[0].browser_download_url);
});
