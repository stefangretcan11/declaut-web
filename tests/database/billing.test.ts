import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const root = mkdtempSync("/tmp/declaut-billing-pg-");
let bin: string;
let admin: Client;
let started = false;
const connection = () => new Client({ host: root, port: 55435, user: "postgres", database: "postgres" });
before(async () => {
  bin = process.env.PG_BIN ?? execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  execFileSync(join(bin, "initdb"), ["-D", join(root, "data"), "-A", "trust", "--no-locale", "-E", "UTF8", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-w", "start", "-o", `-F -k ${root} -c listen_addresses='' -p 55435`], { stdio: "pipe" });
  started = true;
  admin = connection(); await admin.connect();
  await admin.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await admin.query(readFileSync(new URL(file, dir), "utf8"));
}, { timeout: 30000 });
after(async () => { await admin?.end(); if (started) execFileSync(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); rmSync(root, { recursive: true, force: true }); });

async function user() { const id = randomUUID(); await admin.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@example.test`]); return id; }
async function service() { const client = connection(); await client.connect(); await client.query("set role service_role"); return client; }
async function bind(id: string, customer: string) { return (await admin.query("select public.bind_billing_customer($1,$2) as value", [id, customer])).rows[0].value; }
async function begin(id: string) { return (await admin.query("select public.begin_billing_sync($1) as generation", [id])).rows[0].generation; }
function snapshot(id: string, customer: string, pro = true, status = "active") {
  return { id, customer_id: customer, price_id: "price_fixture", status, is_pro: pro, cancel_at_period_end: false, current_period_start: new Date(Date.now() - 3600000).toISOString(), current_period_end: new Date(Date.now() + 86400000).toISOString() };
}
async function apply(generation: string | number, sub: object, invoice: object | null = null) { return (await admin.query("select public.apply_billing_sync($1,$2,$3) as applied", [generation, sub, invoice])).rows[0].applied; }

test("Customer binding is idempotent and cannot reassign the customer to a different account", async () => {
  const owner = await user(); const other = await user();
  assert.equal(await bind(owner, "cus_binding"), "cus_binding");
  assert.equal(await bind(owner, "cus_another"), "cus_binding");
  await assert.rejects(bind(other, "cus_binding"), /unique constraint/);
});

test("Checkout reservations serialize concurrent plan selections and reuse one URL", async () => {
  const owner = await user(); const a = await service(); const b = await service();
  try {
    const results = await Promise.all([a.query("select public.reserve_billing_checkout($1,'price_a') as value", [owner]), b.query("select public.reserve_billing_checkout($1,'price_b') as value", [owner])]);
    const values = results.map((result) => result.rows[0].value);
    assert.equal(values.filter((value) => value.state === "reserved").length, 1);
    assert.equal(values.filter((value) => value.state === "busy").length, 1);
    const reservation = values.find((value) => value.state === "reserved");
    const record = (await admin.query("select price_id from public.billing_checkout_requests where user_id=$1", [owner])).rows[0];
    await admin.query("select public.finish_billing_checkout($1,$2,'cs_test','https://checkout.stripe.com/c/pay/fixture',now()+interval '30 minutes')", [owner, reservation.token]);
    const repeated = (await a.query("select public.reserve_billing_checkout($1,$2) as value", [owner, record.price_id])).rows[0].value;
    assert.equal(repeated.state, "existing");
    assert.equal(repeated.url, "https://checkout.stripe.com/c/pay/fixture");
  } finally { await a.end(); await b.end(); }
});

test("Fencing rejects older subscription writes; unknown prices cannot grant desktop Pro", async () => {
  const owner = await user(); await bind(owner, "cus_fence");
  const sub = snapshot("sub_fence", "cus_fence");
  const older = await begin(sub.id); const newer = await begin(sub.id);
  assert.equal(await apply(newer, { ...sub, is_pro: false }), true);
  assert.equal(await apply(older, sub), false);
  const current = (await admin.query("select status,is_pro from public.subscriptions where id=$1", [sub.id])).rows[0];
  assert.deepEqual(current, { status: "active", is_pro: false });
  assert.equal((await admin.query("select plan from public.resolve_device_license($1,'fixture-device','Fixture PC')", [owner])).rows[0].plan, "free");
  const renewed = await begin(sub.id); assert.equal(await apply(renewed, sub), true);
  assert.equal((await admin.query("select plan from public.resolve_device_license($1,'fixture-device','Fixture PC')", [owner])).rows[0].plan, "pro");
});

test("Invoice replay keeps one row and preserves separately issued fiscal details", async () => {
  const owner = await user(); await bind(owner, "cus_invoice");
  const sub = snapshot("sub_invoice", "cus_invoice");
  const invoice = { id: "in_db_fixture", subscription_id: sub.id, status: "paid", currency: "ron", amount_paid: 30000, stripe_invoice_number: "STRIPE-001", stripe_hosted_invoice_url: "https://invoice.stripe.com/i/test", stripe_invoice_pdf_url: "https://pay.stripe.com/invoice/test/pdf", created_at: new Date().toISOString() };
  assert.equal(await apply(await begin(sub.id), sub, invoice), true);
  let row = (await admin.query("select fiscal_status,fiscal_number from public.billing_invoices where id=$1", [invoice.id])).rows[0];
  assert.deepEqual(row, { fiscal_status: "pending", fiscal_number: null });
  await admin.query("update public.billing_invoices set fiscal_status='issued',fiscal_number='RO-DEMO-1',fiscal_pdf_url='https://fiscal.example.test/1.pdf' where id=$1", [invoice.id]);
  assert.equal(await apply(await begin(sub.id), sub, invoice), true);
  assert.equal((await admin.query("select id from public.billing_invoices where id=$1", [invoice.id])).rowCount, 1);
  row = (await admin.query("select fiscal_status,fiscal_number from public.billing_invoices where id=$1", [invoice.id])).rows[0];
  assert.deepEqual(row, { fiscal_status: "issued", fiscal_number: "RO-DEMO-1" });
});

test("Invoice RLS allows only owner reads; client writes and billing RPCs are denied", async () => {
  const owner = await user(); const other = await user(); await bind(owner, "cus_rls_invoice");
  const sub = snapshot("sub_rls_invoice", "cus_rls_invoice");
  await apply(await begin(sub.id), sub, { id: "in_rls", subscription_id: sub.id, status: "paid", currency: "ron", amount_paid: 30000, stripe_invoice_number: null, stripe_hosted_invoice_url: null, stripe_invoice_pdf_url: null, created_at: new Date().toISOString() });
  const client = connection(); await client.connect(); await client.query("set role authenticated");
  try {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    assert.equal((await client.query("select id from public.billing_invoices")).rowCount, 1);
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await client.query("select id from public.billing_invoices")).rowCount, 0);
    await assert.rejects(client.query("delete from public.billing_invoices"), /permission denied/);
    await assert.rejects(client.query("select public.begin_billing_sync('sub_attack')"), /permission denied/);
    await assert.rejects(client.query("select public.bind_billing_customer($1,'cus_attack')", [other]), /permission denied/);
    for (const table of ["billing_sync_cursors", "billing_webhook_events", "billing_checkout_requests"]) await assert.rejects(client.query(`select * from public.${table}`), /permission denied/);
  } finally { await client.end(); }
});
