import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// A disposable PostgreSQL cluster, never the configured Supabase project.
const root = mkdtempSync("/tmp/declaut-pg-");
const dataDir = join(root, "data");
let bin: string;
let started = false;
let admin: Client;
const backfilledId = randomUUID();

function connection() { return new Client({ host: root, port: 55435, database: "postgres", user: "postgres" }); }

before(async () => {
  bin = process.env.PG_BIN ?? execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  execFileSync(join(bin, "initdb"), ["-D", dataDir, "-A", "trust", "--no-locale", "-E", "UTF8", "-U", "postgres"], { stdio: "pipe" });
  try {
    execFileSync(join(bin, "pg_ctl"), ["-D", dataDir, "-l", join(root, "server.log"), "-w", "start", "-o", `-F -k ${root} -c listen_addresses='' -p 55435`], { stdio: "pipe" });
  } catch {
    throw new Error(`Temporary PostgreSQL could not start: ${readFileSync(join(root, "server.log"), "utf8")}`);
  }
  started = true;
  admin = connection();
  await admin.connect();
  await admin.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  await admin.query("insert into auth.users (id, email) values ($1, 'existing@example.test')", [backfilledId]);
  const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(new URL(file, migrationDir), "utf8"));
  }
}, { timeout: 30_000 });

after(async () => {
  await admin?.end();
  if (started) execFileSync(join(bin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(root, { recursive: true, force: true });
});

async function newUser() {
  const id = randomUUID();
  await admin.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, `${id}@example.test`, { company_name: "Test SRL", cui: "RO1234" }]);
  return id;
}

async function subscription(userId: string, status = "active", start = "-1 hour", end = "30 days", cancel = false) {
  const id = `sub_${randomUUID()}`;
  await admin.query(`insert into public.subscriptions (id, user_id, status, price_id, current_period_start, current_period_end, cancel_at_period_end)
    values ($1, $2, $3, 'price_test', now() + $4::interval, now() + $5::interval, $6)`, [id, userId, status, start, end, cancel]);
  return id;
}

async function session(role: "authenticated" | "anon" | "service_role", userId?: string) {
  const client = connection();
  await client.connect();
  await client.query(`set role ${role}`);
  if (userId) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  return client;
}

async function resolve(userId: string, deviceId: string, client?: Client) {
  const connection = client ?? await session("service_role");
  try { return (await connection.query("select * from public.resolve_device_license($1, $2, $3)", [userId, deviceId, "Test PC"])).rows[0]; }
  finally { if (!client) await connection.end(); }
}

test("Migration backfills existing users; signup trigger creates a profile", async () => {
  assert.equal((await admin.query("select id from public.profiles where id = $1", [backfilledId])).rowCount, 1);
  const user = await newUser();
  const { rows } = await admin.query("select * from public.profiles where id = $1", [user]);
  assert.equal(rows[0].company_name, "Test SRL");
  assert.equal(rows[0].cui, "RO1234");
});

test("Signup records consent with a server timestamp and never invents legacy consent", async () => {
  const user = randomUUID();
  await admin.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'consent@example.test', $2)", [user, { terms_accepted: true, terms_version: "2026-10-24-staging", company_name: "Test SRL", cui: "RO1234" }]);
  const { rows } = await admin.query("select terms_accepted_at, terms_version from public.profiles where id = $1", [user]);
  assert.equal(rows[0].terms_version, "2026-10-24-staging");
  assert.ok(Math.abs(Date.now() - rows[0].terms_accepted_at.getTime()) < 10000);
  const legacy = await admin.query("select terms_accepted_at from public.profiles where id = $1", [backfilledId]);
  assert.equal(legacy.rows[0].terms_accepted_at, null);
  const invalidVersion = randomUUID();
  await admin.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'wrong-version@example.test', $2)", [invalidVersion, { terms_accepted: true, terms_version: "unknown" }]);
  assert.equal((await admin.query("select terms_accepted_at from public.profiles where id = $1", [invalidVersion])).rows[0].terms_accepted_at, null);
});

test("RLS restricts all three tables to their owner; client writes and RPC are denied", async () => {
  const owner = await newUser();
  const other = await newUser();
  await subscription(owner); await subscription(other);
  await resolve(owner, "owner-device"); await resolve(other, "other-device");
  const client = await session("authenticated", owner);
  try {
    assert.equal((await client.query("select id from public.profiles")).rowCount, 1);
    assert.equal((await client.query("select user_id from public.subscriptions")).rows.every((r) => r.user_id === owner), true);
    assert.equal((await client.query("select user_id from public.devices")).rows.every((r) => r.user_id === owner), true);
    for (const table of ["profiles", "subscriptions", "devices"]) {
      await assert.rejects(client.query(`delete from public.${table}`), /permission denied/);
      await assert.rejects(client.query(`update public.${table} set ${table === "profiles" ? "email = 'changed@example.test'" : "user_id = user_id"}`), /permission denied/);
      await assert.rejects(client.query(`insert into public.${table} default values`), /permission denied/);
    }
    await assert.rejects(resolve(other, "stolen", client), /permission denied/);
  } finally { await client.end(); }
  const anonymous = await session("anon");
  try {
    for (const table of ["profiles", "subscriptions", "devices"]) await assert.rejects(anonymous.query(`select * from public.${table}`), /permission denied/);
    await assert.rejects(resolve(owner, "anonymous", anonymous), /permission denied/);
  } finally { await anonymous.end(); }
});

test("Free account device registration is idempotent", async () => {
  const user = await newUser();
  assert.deepEqual(await resolve(user, "free-device"), { plan: "free", device_limit_reached: false, pro_until: null });
  await resolve(user, "free-device");
  assert.equal((await admin.query("select id from public.devices where user_id = $1", [user])).rowCount, 1);
});

test("Active and trialing grant Pro; other statuses and ended periods grant Free", async () => {
  for (const status of ["active", "trialing", "canceled", "unpaid", "paused", "incomplete", "incomplete_expired"]) {
    const user = await newUser(); await subscription(user, status);
    assert.equal((await resolve(user, "device")).plan, ["active", "trialing"].includes(status) ? "pro" : "free", status);
  }
  const expired = await newUser(); await subscription(expired, "active", "-31 days", "-1 second", true);
  assert.equal((await resolve(expired, "device")).plan, "free");
  const cancelAtEnd = await newUser(); await subscription(cancelAtEnd, "active", "-1 day", "1 day", true);
  assert.equal((await resolve(cancelAtEnd, "device")).plan, "pro");
});

test("Past-due grace uses the current period start and expires at 72 hours", async () => {
  const inside = await newUser(); await subscription(inside, "past_due", "-71 hours");
  const result = await resolve(inside, "device");
  assert.equal(result.plan, "pro");
  assert.ok(Math.abs(result.pro_until.getTime() - Date.now() - 3_600_000) < 10_000);
  const boundary = await newUser(); await subscription(boundary, "past_due", "-72 hours");
  assert.equal((await resolve(boundary, "device")).plan, "free");
  const outside = await newUser(); await subscription(outside, "past_due", "-4 days");
  assert.equal((await resolve(outside, "device")).plan, "free");
});

test("Simultaneous requests grant exactly two Pro devices and the third gets Free", async () => {
  const user = await newUser(); await subscription(user);
  const results = await Promise.all(["one", "two", "three"].map((device) => resolve(user, device)));
  assert.equal(results.filter((r) => r.plan === "pro").length, 2);
  assert.equal(results.filter((r) => r.plan === "free" && r.device_limit_reached).length, 1);
  const { rows } = await admin.query("select device_id from public.devices where user_id = $1 order by created_at, id", [user]);
  assert.equal((await resolve(user, rows[0].device_id)).plan, "pro");
  assert.equal((await resolve(user, rows[2].device_id)).device_limit_reached, true);
  await admin.query("delete from public.devices where user_id = $1 and device_id = $2", [user, rows[0].device_id]);
  assert.equal((await resolve(user, rows[2].device_id)).plan, "pro");
});
