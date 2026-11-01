import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function ready(page: Page) {
  await expect(page.locator(".marketing-site")).toHaveAttribute("data-motion-ready", "true");
}

async function positionSection(page: Page, id: string, viewportFraction: number) {
  await page.evaluate(({ id, viewportFraction }) => {
    const section = document.getElementById(id)!.closest("section")!;
    window.scrollTo({ top: section.getBoundingClientRect().top + scrollY - innerHeight * viewportFraction, behavior: "instant" });
  }, { id, viewportFraction });
}

test("workflow stages reveal once and preserve illustrative declaration states", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await ready(page);
  await expect(page.locator(".marketing-hero-actions")).toHaveCSS("pointer-events", "auto");
  await expect(page.locator(".marketing-hero-actions")).toHaveCSS("opacity", "1");
  await expect(page.locator(".marketing-hero-copy > p:not(.eyebrow)")).toHaveCSS("opacity", "1");
  mkdirSync(".artifacts", { recursive: true });
  await page.screenshot({ path: ".artifacts/motion-hero.png" });

  const matrix = page.locator(".matrix-preview").last();
  const originalStates = await matrix.innerText();
  // Keep the following stage outside the viewport while checking this one.
  await positionSection(page, "matrix-title", 0.72);
  await expect(matrix.locator(".preview-table-row").last()).toHaveCSS("opacity", "1");
  expect(await matrix.innerText()).toBe(originalStates);

  const progress = page.locator(".preview-progress > span");
  await positionSection(page, "upload-title", 0.86);
  await expect.poll(() => progress.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(0.9);
  await positionSection(page, "upload-title", 0.28);
  await expect.poll(() => progress.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(1, 2);
  await expect(progress).toHaveCSS("transform", "none");
  await expect(page.locator("#upload-title")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".artifacts/motion-workflow.png" });

  // Returning to a completed stage keeps the illustration settled.
  await positionSection(page, "upload-title", 0.86);
  await expect.poll(() => progress.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(1, 2);
  await expect.poll(() => progress.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(page.locator("#upload-title")).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});

test("keyboard focus and deep links immediately expose their content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await ready(page);
  const link = page.locator(".marketing-update-card a").first();
  await page.locator(".marketing-update-grid").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".marketing-update-card").first().evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  await link.focus();
  await expect(link).toBeFocused();
  expect(await page.locator(".marketing-update-card").first().evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await link.press("Enter");
  await expect(page).toHaveURL(/\/noutati#scanare-in-fundal$/);
  await expect(page.locator("#scanare-in-fundal .marketing-update-body")).toHaveCSS("opacity", "1");
  await page.goto("/noutati#model-excel");
  await expect(page.locator("#model-excel .marketing-update-body")).toHaveCSS("opacity", "1");
});

test("reduced motion works both at first load and when changed during a visit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".marketing-hero-preview")).toHaveCSS("opacity", "1");
  await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
  await expect(page.locator(".upload-preview")).toHaveCSS("transform", "none");
});

test("layouts remain stable across mobile, tablet and desktop with motion enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await ready(page);
    const heightBefore = await page.locator("body").evaluate((element) => element.scrollHeight);
    await positionSection(page, "receipt-title", 0.35);
    await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    expect(await page.locator("body").evaluate((element) => element.scrollHeight)).toBe(heightBefore);
  }
});

test("unsupported animation APIs leave meaningful content immediately readable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#hero-title")).toHaveCSS("opacity", "1");
  await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
  await expect(page.locator(".upload-preview")).toHaveCSS("transform", "none");
});

test("content, navigation and native disclosures work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:3100/");
    await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
    await page.locator(".marketing-mobile-navigation summary").click();
    await page.getByRole("navigation", { name: "Navigație mobilă" }).getByRole("link", { name: "Întrebări", exact: true }).click();
    const question = page.locator("details").filter({ has: page.locator("summary", { hasText: "Pot importa firmele din Excel?" }) });
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeVisible();
  } finally {
    await context.close();
  }
});
