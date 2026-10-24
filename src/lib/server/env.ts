import "server-only";
import { z } from "zod";

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function publicSupabaseEnv() {
  const result = supabaseSchema.omit({ SUPABASE_SERVICE_ROLE_KEY: true }).safeParse(process.env);
  if (!result.success) throw new Error("Supabase public configuration is incomplete");
  return result.data;
}

export function supabaseEnv() {
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
  return {
    privateKeyPem: Buffer.from(result.data.LICENSE_PRIVATE_KEY_BASE64, "base64").toString("utf8"),
    keyId: result.data.LICENSE_KEY_ID,
    issuer: result.data.LICENSE_ISSUER,
    audience: result.data.LICENSE_AUDIENCE,
  };
}
