import { createHash, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const environments = ["staging", "production"];
const keys = environments.map((environment) => {
  const pem = readFileSync(`.keys/${environment}/public.pem`, "utf8");
  const fingerprint = createHash("sha256").update(pem).digest("hex").slice(0, 12);
  const jwk = createPublicKey(pem).export({ format: "jwk" });
  return { ...jwk, kid: `${environment}-${fingerprint}`, alg: "EdDSA", use: "sig", environment, issuer: `declaut-${environment}`, audience: "declaut-desktop" };
});
writeFileSync("docs/license-public-keys.json", JSON.stringify({ keys }, null, 2) + "\n");
console.log("Exported staging and production public keys to docs/license-public-keys.json. No private keys included.");
