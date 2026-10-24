import { createLicenseHandler } from "@/lib/license/http";
import { createLicenseSigner } from "@/lib/license/sign";
import { createReleaseReader } from "@/lib/releases";
import { signingEnv } from "@/lib/server/env";
import { authenticate, resolveEntitlement } from "@/lib/server/supabase";

export const runtime = "nodejs";

let signer: ReturnType<typeof createLicenseSigner> | undefined;
const release = createReleaseReader(process.env.GITHUB_RELEASES_REPO, process.env.GITHUB_RELEASE_ASSET_NAME);

export const POST = createLicenseHandler({
  authenticate,
  resolve: resolveEntitlement,
  sign: (userId, deviceId, entitlement) => {
    signer ??= createLicenseSigner(signingEnv());
    return signer(userId, deviceId, entitlement);
  },
  release,
});
