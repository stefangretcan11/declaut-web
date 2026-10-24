import assert from "node:assert/strict";
import { test } from "node:test";
import { createReleaseReader, releaseOptions } from "../src/lib/releases";

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

test("Prereleases require staging preview opt-in; production never enables them", async () => {
  const rc = { ...release, tag_name: "v0.9.0-rc1", prerelease: true };
  const fetcher = (async () => Response.json(rc)) as typeof fetch;
  assert.equal((await createReleaseReader("example/releases", undefined, fetcher)()).latest_version, null);
  assert.equal(releaseOptions({ LICENSE_ISSUER: "declaut-staging", GITHUB_RELEASE_CHANNEL: "preview" }).includePrereleases, true);
  assert.equal(releaseOptions({ LICENSE_ISSUER: "declaut-production", GITHUB_RELEASE_CHANNEL: "preview" }).includePrereleases, false);
  assert.equal(releaseOptions({ LICENSE_ISSUER: "declaut-staging" }).includePrereleases, false);
});

test("Preview channel selects the newest published non-draft release, including RC", async () => {
  const older = { ...release, published_at: "2026-10-23T10:00:00Z" };
  const rc = { ...release, tag_name: "v1.3.0-rc1", prerelease: true, published_at: "2026-10-24T10:00:00Z" };
  const draft = { ...rc, tag_name: "v9.0.0", draft: true, published_at: "2026-10-25T10:00:00Z" };
  const fetcher = (async (url: URL | RequestInfo) => {
    assert.ok(String(url).endsWith("releases?per_page=30"));
    return Response.json([older, draft, rc]);
  }) as typeof fetch;
  const read = createReleaseReader("example/releases", undefined, fetcher, Date.now, { includePrereleases: true });
  assert.equal((await read()).latest_version, "1.3.0-rc1");
});

test("Release metadata rejects installer URLs outside the configured repository or containing credentials", async () => {
  for (const url of ["https://evil.example/setup.exe", "https://github.com/other/repo/releases/download/v1/setup.exe", "https://user:pass@github.com/example/releases/releases/download/v1/setup.exe"]) {
    const fetcher = (async () => Response.json({ ...release, assets: [{ name: "setup.exe", browser_download_url: url }] })) as typeof fetch;
    assert.equal((await createReleaseReader("example/releases", undefined, fetcher)()).download_url, null);
  }
});
