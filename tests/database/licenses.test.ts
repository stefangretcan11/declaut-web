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

test("Simultaneous requests grant Pro to every device, including existing Free registrations", async () => {
  const user = await newUser();
  const devices = ["one", "two", "three", "four", "five"];
  const free = await Promise.all(devices.map((device) => resolve(user, device)));
  assert.equal(free.every((result) => result.plan === "free"), true);
  await subscription(user);
  const results = await Promise.all(devices.map((device) => resolve(user, device)));
  for (const result of results) {
    assert.equal(result.plan, "pro");
    assert.equal(result.device_limit_reached, false);
    assert.ok(result.pro_until > new Date());
  }
  assert.equal((await admin.query("select id from public.devices where user_id = $1", [user])).rowCount, devices.length);
});

test("New Pro registrations have no device cap", async () => {
  const user = await newUser(); await subscription(user);
  const results = await Promise.all(["one", "two", "three", "four"].map((device) => resolve(user, device)));
  assert.equal(results.every((result) => result.plan === "pro" && !result.device_limit_reached), true);
});

test("Unknown Stripe prices cannot grant Pro through the database resolver", async () => {
  const user = await newUser();
  const id = await subscription(user);
  await admin.query("update public.subscriptions set is_pro = false where id = $1", [id]);
  assert.equal((await resolve(user, "unknown-price")).plan, "free");
});

test("Device removal is server-only, owner-scoped and idempotent", async () => {
  const owner = await newUser();
  const foreign = await newUser();
  await resolve(owner, "own-device"); await resolve(foreign, "foreign-device");
  const ownId = (await admin.query("select id from public.devices where user_id = $1", [owner])).rows[0].id;
  const foreignId = (await admin.query("select id from public.devices where user_id = $1", [foreign])).rows[0].id;
  const browser = await session("authenticated", owner);
  try { await assert.rejects(browser.query("select public.remove_own_device($1, $2)", [owner, ownId]), /permission denied/); }
  finally { await browser.end(); }
  const server = await session("service_role");
  try {
    assert.equal((await server.query("select public.remove_own_device($1, $2) as removed", [owner, foreignId])).rows[0].removed, false);
    assert.equal((await server.query("select public.remove_own_device($1, $2) as removed", [owner, ownId])).rows[0].removed, true);
    assert.equal((await server.query("select public.remove_own_device($1, $2) as removed", [owner, ownId])).rows[0].removed, false);
  } finally { await server.end(); }
  assert.equal((await admin.query("select id from public.devices where id = $1", [foreignId])).rowCount, 1);
});

test("Removing a device during another refresh preserves Pro; removed devices can register again", async () => {
  const user = await newUser(); await subscription(user);
  await resolve(user, "first"); await resolve(user, "second"); await resolve(user, "third");
  assert.equal((await resolve(user, "third")).plan, "pro");
  const firstId = (await admin.query("select id from public.devices where user_id = $1 and device_id = 'first'", [user])).rows[0].id;
  const server = await session("service_role");
  try {
    await Promise.all([server.query("select public.remove_own_device($1, $2)", [user, firstId]), resolve(user, "third")]);
    assert.equal((await resolve(user, "third")).plan, "pro");
    assert.equal((await admin.query("select id from public.devices where user_id = $1", [user])).rowCount, 2);
    assert.equal((await resolve(user, "first")).plan, "pro");
    assert.equal((await admin.query("select id from public.devices where user_id = $1", [user])).rowCount, 3);
  } finally { await server.end(); }
});
