import { test, expect } from "@playwright/test";

test("Production public pages identify the operator, show the commercial agreement and exclude private pages from indexing", async ({ page, request }) => {
  test.skip(process.env.LICENSE_ISSUER !== "declaut-production", "Run with the production configuration; this test creates no accounts or payments");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".marketing-prerelease-notice")).toHaveCount(0);
  await expect(page.locator(".marketing-operator")).toContainText("Costache Ionela-Daniela - Expert Contabil");
  await expect(page.locator(".marketing-operator")).toContainText("26143268");
  await page.goto("/signup");
  await expect(page.locator(".consent-field")).toContainText("termenii și condițiile");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/termeni-si-conditii");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Termeni și condiții");
  await expect(page.locator(".legal-content")).toContainText("2026-11-08-production");
  await expect(page.locator(".legal-content")).toContainText("30 de zile gratuite");
  await page.goto("/politica-de-confidentialitate");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politica de confidențialitate");
  await expect(page.getByRole("link", { name: "costache.mihai1710@gmail.com", exact: true })).toBeVisible();
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /account");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("https://www.declaut.ro/preturi");
  expect(await sitemap.text()).not.toContain("/account");
});
