import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { isProductionProject, productionConfigIssues } from "./src/lib/production-config";
import { matchesEd25519Identity } from "./src/lib/license/key-identity";
import production from "./docs/track-b-production-config.json";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && (process.env.LICENSE_ISSUER === "declaut-production" || isProductionProject())) {
    const issues = productionConfigIssues();
    if (!matchesEd25519Identity(Buffer.from(process.env.LICENSE_PRIVATE_KEY_BASE64 ?? "", "base64").toString("utf8"), production.license.publicKey.x)) issues.push("LICENSE_PRIVATE_KEY_BASE64: does not match the production public key");
    if (issues.length) throw new Error(`Production build configuration is incomplete: ${issues.join("; ")}. Use the production env settings; values were not printed.`);
  }
  return nextConfig;
}
