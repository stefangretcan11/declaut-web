// Read-only connectivity checks. Never print credentials, users, or response bodies.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !serverKey) throw new Error("Missing Supabase environment variables");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const publicClient = createClient(url, publicKey, options);
const admin = createClient(url, serverKey, options);
let failed = false;
try {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publicKey }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error();
  const settings = await response.json();
  console.log("Project URL and publishable key: accepted");
  console.log(`Email confirmation: ${settings.mailer_autoconfirm === false ? "required" : "CHECK DASHBOARD — not confirmed as required"}`);
} catch {
  console.log("Project URL and publishable key: check failed (configuration or connectivity)");
  failed = true;
}
try {
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error();
  console.log("Server key: accepted");
} catch {
  console.log("Server key: check failed (configuration or connectivity)");
  failed = true;
}
for (const table of ["profiles", "subscriptions", "devices", "billing_invoices"]) {
  const { error } = await admin.from(table).select("id").limit(0);
  if (error) {
    console.log(`${table}: unavailable (code ${error.code ?? "unknown"}; migration may not be applied)`);
    failed = true;
  } else console.log(`${table}: available`);
}
try {
  const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error();
  const schema = await response.json();
  const required = {
    profiles: ["id", "email", "company_name", "cui", "stripe_customer_id", "terms_accepted_at", "terms_version", "created_at"],
    subscriptions: ["id", "user_id", "status", "price_id", "current_period_start", "current_period_end", "cancel_at_period_end", "is_pro", "updated_at"],
    devices: ["id", "user_id", "device_id", "device_name", "created_at", "last_seen_at"],
    billing_invoices: ["id", "user_id", "subscription_id", "status", "currency", "amount_paid", "stripe_invoice_number", "stripe_hosted_invoice_url", "fiscal_status", "fiscal_number", "fiscal_pdf_url", "created_at"],
  };
  for (const [table, columns] of Object.entries(required)) {
    const { error } = await admin.from(table).select(columns.join(",")).limit(0);
    console.log(`${table} schema: ${error ? `not compatible (code ${error.code ?? "unknown"})` : "compatible"}`);
    if (error) failed = true;
  }
  for (const name of ["resolve_device_license", "remove_own_device", "bind_billing_customer", "reserve_billing_checkout", "begin_billing_sync", "apply_billing_sync"]) {
    const exists = Boolean(schema.paths?.[`/rpc/${name}`]);
    console.log(`${name} RPC: ${exists ? "available" : "missing — apply migration"}`);
    if (!exists) failed = true;
  }
} catch { console.log("Schema compatibility: inspection unavailable"); failed = true; }
const { error: anonymousError } = await publicClient.from("profiles").select("id").limit(0);
if (!anonymousError) { console.log("Anonymous profile access: unexpectedly allowed"); failed = true; }
else console.log("Anonymous profile access: denied");
process.exitCode = failed ? 1 : 0;
