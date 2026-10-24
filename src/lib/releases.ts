import { z } from "zod";
import type { ReleaseInfo } from "./license/types";

const releaseSchema = z.object({
  tag_name: z.string().min(1),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});
const unavailable: ReleaseInfo = { latest_version: null, download_url: null };
const HOUR = 3_600_000;

export function createReleaseReader(
  repo: string | undefined,
  assetName: string | undefined,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  let cached: ReleaseInfo | undefined;
  let retryAt = 0;
  let inflight: Promise<ReleaseInfo> | undefined;

  async function refresh(): Promise<ReleaseInfo> {
    try {
      const response = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "declaut-license-api" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error("Release metadata unavailable");
      const release = releaseSchema.parse(await response.json());
      if (release.draft || release.prerelease) throw new Error("No stable release");
      const candidates = release.assets.filter((asset) => assetName ? asset.name === assetName : /\.exe$/i.test(asset.name));
      // Avoid guessing between multiple installers. Configure the exact asset name.
      const asset = candidates.length === 1 ? candidates[0] : undefined;
      const download = asset ? new URL(asset.browser_download_url) : undefined;
      if (download && (download.protocol !== "https:" || download.hostname !== "github.com" || !download.pathname.startsWith(`/${repo}/releases/download/`))) {
        throw new Error("Unexpected installer URL");
      }
      cached = { latest_version: release.tag_name.replace(/^v(?=\d)/, ""), download_url: download?.href ?? null };
      retryAt = clock() + HOUR;
      return cached;
    } catch {
      retryAt = clock() + 60_000;
      return cached ?? unavailable;
    }
  }

  return async function getLatestRelease(): Promise<ReleaseInfo> {
    if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return unavailable;
    if (clock() < retryAt) return cached ?? unavailable;
    inflight ??= refresh().finally(() => { inflight = undefined; });
    return inflight;
  };
}
