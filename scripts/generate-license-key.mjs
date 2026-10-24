import { createHash, generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const environment = process.argv[2] ?? "staging";
if (!["staging", "production"].includes(environment)) throw new Error("Use staging or production");
const envPath = resolve(environment === "staging" ? ".env.local" : ".env.production.local");
const directory = resolve(".keys", environment);
const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (existsSync(resolve(directory, "private.pem")) || /^LICENSE_PRIVATE_KEY_BASE64=.+/m.test(envText)) {
  throw new Error("A signing key already exists. Preserve it; rotate keys deliberately with Track B.");
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const fingerprint = createHash("sha256").update(publicKey).digest("hex").slice(0, 12);
const keyId = `${environment}-${fingerprint}`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(resolve(directory, "private.pem"), privateKey, { mode: 0o600, flag: "wx" });
writeFileSync(resolve(directory, "public.pem"), publicKey, { mode: 0o644, flag: "wx" });
const additions = {
  LICENSE_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString("base64"),
  LICENSE_KEY_ID: keyId,
  LICENSE_ISSUER: `declaut-${environment}`,
  LICENSE_AUDIENCE: "declaut-desktop",
};
let updated = envText;
for (const [name, value] of Object.entries(additions)) {
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(updated)) updated = updated.replace(pattern, `${name}=${value}`);
  else updated += `${updated.endsWith("\n") || !updated ? "" : "\n"}${name}=${value}\n`;
}
writeFileSync(envPath, updated, { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log(`Created ${environment} Ed25519 key pair; key ID: ${keyId}`);
console.log(`Public key for Track B: ${resolve(directory, "public.pem")}`);
console.log(`Server signing configuration added to ${envPath}. Private key values were not printed.`);
