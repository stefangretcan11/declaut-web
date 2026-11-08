import { createPrivateKey, createPublicKey } from "node:crypto";

export function matchesEd25519Identity(privateKeyPem: string, publicX: string): boolean {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    return privateKey.asymmetricKeyType === "ed25519" && createPublicKey(privateKey).export({ format: "jwk" }).x === publicX;
  } catch { return false; }
}
