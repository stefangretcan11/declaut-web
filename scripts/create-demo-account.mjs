import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  if (process.env.LICENSE_ISSUER !== "declaut-staging") throw new Error("Demo accounts can be created only with staging configuration");
  const path = resolve(".env.demo.local");
  if (existsSync(path)) throw new Error("Demo credentials already exist in .env.demo.local; reuse that account");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serverKey) throw new Error("Missing staging Supabase configuration");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serverKey, options);
  const client = createClient(url, publicKey, options);
  const email = `demo-${Date.now().toString(36)}@example.invalid`;
  const password = `Demo-${randomBytes(20).toString("base64url")}!Aa1`;
  const result = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { company_name: "Declaut Demo (test)", cui: "RO123456", demo: true },
  });
  if (result.error || !result.data.user) throw new Error("Could not create the staging demo account");
  try {
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error("Demo sign-in verification failed");
    const profile = await client.from("profiles").select("company_name").eq("id", result.data.user.id).single();
    if (profile.error || profile.data?.company_name !== "Declaut Demo (test)") throw new Error("Demo profile verification failed");
    writeFileSync(path, `# Confirmed staging demo account. Not a working email inbox.\nDEMO_EMAIL=${email}\nDEMO_PASSWORD=${password}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Created confirmed staging demo account: ${email}`);
    console.log("REST sign-in and own-profile access verified.");
    console.log(`Email and password saved in ${path} (ignored by Git).`);
    console.log("This account remains available for manual preview; automated test accounts are separate.");
  } catch (error) {
    const cleanup = await admin.auth.admin.deleteUser(result.data.user.id);
    if (cleanup.error) console.error("Demo account cleanup failed; inspect Supabase Auth before retrying.");
    throw error;
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Demo account creation failed"); process.exitCode = 1; });
