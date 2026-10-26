import { importPKCS8, SignJWT } from "jose";
import type { Entitlement } from "./types";
import { FREE_MAX_FIRMS } from "./plans";

export const LICENSE_TTL_SECONDS = 24 * 60 * 60;

export type SigningConfig = {
  privateKeyPem: string;
  keyId: string;
  issuer: string;
  audience: string;
};

export function createLicenseSigner(config: SigningConfig) {
  // Import lazily; keep the promise for reuse by this server instance.
  let key: ReturnType<typeof importPKCS8> | undefined;

  return async function signLicense(
    userId: string,
    deviceId: string,
    entitlement: Entitlement,
    now = new Date(),
  ): Promise<{ token: string; expires_at: string }> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    let expiresAt = issuedAt + LICENSE_TTL_SECONDS;
    if (entitlement.plan === "pro") {
      const boundary = Date.parse(entitlement.pro_until ?? "");
      if (!Number.isFinite(boundary)) throw new Error("Invalid Pro entitlement boundary");
      expiresAt = Math.min(expiresAt, Math.floor(boundary / 1000));
      if (expiresAt <= issuedAt) throw new Error("Pro entitlement expired during issuance");
    }
    key ??= importPKCS8(config.privateKeyPem, "EdDSA");
    const token = await new SignJWT({
      v: 1,
      device_id: deviceId,
      plan: entitlement.plan,
      ...(entitlement.plan === "free" ? { max_firms: FREE_MAX_FIRMS } : {}),
    })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: config.keyId })
      .setSubject(userId)
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(await key);
    return { token, expires_at: new Date(expiresAt * 1000).toISOString() };
  };
}
