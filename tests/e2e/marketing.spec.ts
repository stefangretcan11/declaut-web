import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("Romanian marketing routes, navigation and release availability work on desktop and mobile", async ({ page, request }) => {
  const pages = ["/", "/preturi", "/descarcare", "/intrebari-frecvente", "/contact", "/termeni-si-conditii", "/politica-de-confidentialitate"];
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/preturi");
  await expect(page.locator(".marketing-pro-prices")).toContainText("300");
  await expect(page.locator(".marketing-pro-prices")).toContainText("500");
  await expect(page.locator(".marketing-pro-prices")).toContainText("6 luni");
  if (process.env.GITHUB_RELEASES_REPO && process.env.GITHUB_RELEASE_CHANNEL === "preview" && process.env.LICENSE_ISSUER === "declaut-staging") {
    await page.goto("/descarcare");
    await expect(page.getByRole("link", { name: "Descarcă instalatorul" })).toHaveAttribute("href", new RegExp(`^https://github\\.com/${process.env.GITHUB_RELEASES_REPO}/releases/download/`));
    await expect(page.locator(".marketing-release-channel")).toContainText("Canal de testare");
  }
  await page.goto("/");
  mkdirSync(".artifacts", { recursive: true });
  await page.screenshot({ path: ".artifacts/home-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: ".artifacts/home-mobile.png", fullPage: true });
  await page.locator(".marketing-mobile-navigation summary").click();
  await page.getByRole("navigation", { name: "Navigație mobilă" }).getByRole("link", { name: "Prețuri", exact: true }).click();
  await expect(page).toHaveURL(/\/preturi$/);
  for (const path of ["/preturi", "/descarcare", "/intrebari-frecvente", "/contact"]) {
    await page.goto(path);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  }
  const license = await request.post("/api/license", { data: { device_id: "marketing-check", device_name: "Marketing check" } });
  expect(license.status()).toBe(401);
  expect((await license.json()).error.code).toBe("unauthorized");
  const deploymentCheck = execFileSync(process.execPath, ["scripts/check-deployment.mjs", "--url=http://127.0.0.1:3100", "--allow-local"], { encoding: "utf8", timeout: 30_000 });
  expect(deploymentCheck).toContain("Deployment page and authentication-boundary checks passed");
});
