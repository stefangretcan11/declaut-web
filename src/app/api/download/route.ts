import { createInstallerDownloadHandler } from "@/lib/installer-download";
import { createReleaseReader, releaseOptions } from "@/lib/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const release = createReleaseReader(process.env.GITHUB_RELEASES_REPO, process.env.GITHUB_RELEASE_ASSET_NAME, fetch, Date.now, releaseOptions());
const download = createInstallerDownloadHandler({ release, repo: process.env.GITHUB_RELEASES_REPO });

export const GET = download;
export const HEAD = download;
