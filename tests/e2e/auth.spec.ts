import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { importSPKI, jwtVerify } from "jose";

const origin = "http://127.0.0.1:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
const publicClient = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options);
const email = `auth-browser-${randomUUID()}@example.invalid`;
const password = `${randomBytes(24).toString("base64url")}Aa1!`;
const newPassword = `${randomBytes(24).toString("base64url")}Bb2!`;
let userId: string | undefined;
let confirmationHash: string;

test.beforeAll(async () => {
  // generateLink creates an unconfirmed signup and a real one-time token without
  // sending email. SMTP delivery is a separate acceptance check once configured.
  const result = await admin.auth.admin.generateLink({ type: "signup", email, password, options: { data: {
    company_name: "Auth Browser Test SRL", cui: "RO123456", terms_accepted: true, terms_version: "2026-10-24-staging",
  } } });
  if (result.error || !result.data.user || !result.data.properties?.hashed_token) throw new Error("Could not create the temporary auth fixture");
  userId = result.data.user.id;
  confirmationHash = result.data.properties.hashed_token;
});

test.afterAll(async () => {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Could not remove the temporary auth-browser account");
  }
});

test("Responsive signup, validation, confirmation, login, reset and REST licensing", async ({ page, request, context }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Un început simplu." })).toBeVisible();
  for (const name of ["company_name", "cui", "email", "password", "terms"]) await expect(page.locator(`[name="${name}"]`)).toHaveAttribute("required", "");
  mkdirSync(".artifacts", { recursive: true });
  await page.screenshot({ path: ".artifacts/signup-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: ".artifacts/signup-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  const csrf = await request.post("/api/auth/signup", { headers: { Origin: "https://evil.example", Accept: "application/json" }, data: {} });
  expect(csrf.status()).toBe(403);
  const missingTerms = await request.post("/api/auth/signup", { headers: { Origin: origin, Accept: "application/json" }, data: { email, password, company_name: "Test SRL", cui: "RO123456" } });
  expect(missingTerms.status()).toBe(422);
  expect(Boolean((await missingTerms.json()).fields?.terms)).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Autentifică-te", exact: true }).click();
  await expect(page.locator('.auth-form [role="alert"]')).toContainText("Confirmă adresa de email");

  await page.goto(`/auth/confirm?token_hash=${confirmationHash}&type=email`);
  const unconfirmed = await admin.auth.admin.getUserById(userId!);
  expect(Boolean(unconfirmed.data.user?.email_confirmed_at)).toBe(false);
  await page.getByRole("button", { name: "Continuă", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Auth Browser Test SRL", { exact: true })).toBeVisible();
  await expect(page.getByText("RO123456", { exact: true })).toBeVisible();
  const profile = await admin.from("profiles").select("terms_accepted_at,terms_version").eq("id", userId).single();
  expect(Boolean(profile.data?.terms_accepted_at)).toBe(true);
  expect(profile.data?.terms_version).toBe("2026-10-24-staging");
  const cookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
  expect(cookies.length > 0).toBe(true);
  expect(cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);

  const signedIn = await publicClient().auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("Confirmed account could not sign in through Supabase REST");
  const license = await request.post("/api/license", { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` }, data: { device_id: "auth-browser-desktop", device_name: "Auth browser test" } });
  expect(license.status()).toBe(200);
  const body = await license.json();
  const key = await importSPKI(readFileSync(".keys/staging/public.pem", "utf8"), "EdDSA");
  const verified = await jwtVerify(body.token, key, { algorithms: ["EdDSA"], issuer: process.env.LICENSE_ISSUER, audience: process.env.LICENSE_AUDIENCE });
  expect(verified.payload.plan).toBe("free");

  await page.getByRole("button", { name: "Deconectează-te", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?status=signed_out$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Autentifică-te", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);

  const recovery = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (recovery.error || !recovery.data.properties?.hashed_token) throw new Error("Could not generate the real recovery fixture");
  await context.clearCookies();
  await page.goto(`/auth/confirm?token_hash=${recovery.data.properties.hashed_token}&type=recovery`);
  await page.getByRole("button", { name: "Continuă", exact: true }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Parolă nouă", { exact: true }).fill(newPassword);
  await page.getByLabel("Repetă parola nouă", { exact: true }).fill("different long password");
  await page.getByRole("button", { name: "Salvează parola", exact: true }).click();
  await expect(page.locator("#confirm_password-error")).toContainText("Parolele nu coincid");
  await page.getByLabel("Repetă parola nouă", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Salvează parola", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?status=password_updated$/);
  const oldLogin = await publicClient().auth.signInWithPassword({ email, password });
  expect(Boolean(oldLogin.error)).toBe(true);
  const newLogin = await publicClient().auth.signInWithPassword({ email, password: newPassword });
  expect(Boolean(newLogin.data.session)).toBe(true);

  await page.goto(`/auth/confirm?token_hash=${confirmationHash}&type=email`);
  await page.getByRole("button", { name: "Continuă", exact: true }).click();
  await expect(page.locator('.auth-form [role="alert"]')).toContainText("Linkul nu este valid sau a expirat");
});
