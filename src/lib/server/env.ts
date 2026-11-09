import "server-only";
import { z } from "zod";
import { productionSupabaseMatches } from "../production-config";
import production from "../../../docs/track-b-production-config.json";
import { matchesEd25519Identity } from "../license/key-identity";

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function publicSupabaseEnv() {
  if (process.env.LICENSE_ISSUER === "declaut-production" && !productionSupabaseMatches()) throw new Error("Production Supabase configuration does not match the public handoff");
  const result = supabaseSchema.omit({ SUPABASE_SERVICE_ROLE_KEY: true }).safeParse(process.env);
  if (!result.success) throw new Error("Supabase public configuration is incomplete");
  return result.data;
}

export function supabaseEnv() {
  if (process.env.LICENSE_ISSUER === "declaut-production" && !productionSupabaseMatches()) throw new Error("Production Supabase configuration does not match the public handoff");
  const result = supabaseSchema.safeParse(process.env);
  if (!result.success) throw new Error("Supabase server configuration is incomplete");
  return result.data;
}

export function signingEnv() {
  const result = z.object({
    LICENSE_PRIVATE_KEY_BASE64: z.string().min(1),
    LICENSE_KEY_ID: z.string().min(1),
    LICENSE_ISSUER: z.string().min(1),
    LICENSE_AUDIENCE: z.string().min(1),
  }).safeParse(process.env);
  if (!result.success) throw new Error("License signing configuration is incomplete");
  const privateKeyPem = Buffer.from(result.data.LICENSE_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  if (result.data.LICENSE_ISSUER === "declaut-production" && (result.data.LICENSE_KEY_ID !== production.license.publicKey.kid || result.data.LICENSE_AUDIENCE !== production.license.audience || !matchesEd25519Identity(privateKeyPem, production.license.publicKey.x))) throw new Error("Production signing identity does not match the desktop public key");
  return {
    privateKeyPem,
    keyId: result.data.LICENSE_KEY_ID,
    issuer: result.data.LICENSE_ISSUER,
    audience: result.data.LICENSE_AUDIENCE,
  };
}
