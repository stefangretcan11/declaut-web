import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function scrollStory(page: Page, progress: number) {
  await page.locator("[data-workflow-story]").evaluate((element, progress) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo({ top: rect.top + scrollY + (rect.height - innerHeight) * progress, behavior: "instant" });
  }, progress);
}

test("one persistent application window tells and reverses the complete fictional story", async ({ page }) => {
  const errors: string[] = [];
  const anafRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydrat|did not match|server rendered/i.test(message.text())) errors.push(message.text()); });
  page.on("request", (request) => { if (/https?:\/\/[^/]*(?:anaf\.|mfinante\.)/.test(request.url())) anafRequests.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("[data-workflow-story]")).toHaveAttribute("data-story-mode", "scroll");
  await expect(page.locator(".marketing-hero-actions")).toHaveCSS("opacity", "1");
  await expect(page.locator(".marketing-hero-copy > p:not(.eyebrow)")).toHaveCSS("opacity", "1");
  mkdirSync(".artifacts", { recursive: true });
  await page.screenshot({ path: ".artifacts/story-hero.png" });
  const window = page.locator("[data-story-window]");
  const handle = await window.elementHandle();
  const ready = window.locator(".story-selected-cell [data-demo-status=ready]");
  const sending = window.locator(".story-selected-cell [data-demo-status=sending]");
  const validated = window.locator(".story-selected-cell [data-demo-status=validated]");
  const receipt = window.locator("[data-story-receipt]");
  const bar = window.locator("[data-story-send-progress]");

  await scrollStory(page, 0.2);
  await expect(ready).toHaveCSS("opacity", "1");
  await expect(window.locator("[data-story-row]").last()).toHaveCSS("opacity", "1");
  const original = await window.boundingBox();
  expect(original).not.toBeNull();
  await page.screenshot({ path: ".artifacts/story-organize.png" });

  await scrollStory(page, 0.55);
  await expect(sending).toHaveCSS("opacity", "1");
  await expect.poll(() => bar.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(0.35);
  await expect.poll(() => bar.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(0.65);
  await expect(receipt).toHaveCSS("opacity", "0");
  await expect(window.locator(".story-selection")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".artifacts/story-submit.png" });

  await scrollStory(page, 0.92);
  await expect(validated).toHaveCSS("opacity", "1");
  await expect(receipt).toHaveCSS("opacity", "1");
  await expect(window).toHaveCount(1);
  await expect(window.locator("figcaption")).toContainText("fără transmitere către ANAF");
  await expect(receipt).toContainText("DEMO-00112");
  expect(await handle!.evaluate((element) => element.isConnected && element === document.querySelector("[data-story-window]"))).toBe(true);
  const final = await window.boundingBox();
  for (const key of ["x", "y", "width", "height"] as const) expect(final![key]).toBeCloseTo(original![key], 0);
  await page.screenshot({ path: ".artifacts/story-receipt.png" });

  await scrollStory(page, 0.5);
  await expect(sending).toHaveCSS("opacity", "1");
  await expect(receipt).toHaveCSS("opacity", "0");
  await expect.poll(() => bar.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(0.4);
  await scrollStory(page, 0.2);
  await expect(ready).toHaveCSS("opacity", "1");
  await expect(validated).toHaveCSS("opacity", "0");
  await expect(window.locator("[data-story-row]").last()).toHaveCSS("opacity", "1");
  expect(await window.locator("[data-story-row]").last().evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(false);
  expect(errors).toEqual([]);
  expect(anafRequests).toEqual([]);
});

test("the entire sticky composition fits laptops and roomy tablets without clipping", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [width, height] of [[1000, 720], [1024, 768], [1366, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("[data-workflow-story]")).toHaveAttribute("data-story-mode", "scroll");
    await scrollStory(page, 0.92);
    await expect(page.locator("[data-story-receipt]")).toHaveCSS("opacity", "1");
    const box = await page.locator("[data-story-window]").boundingBox();
    expect(box!.x).toBeGreaterThan(0);
    expect(box!.y).toBeGreaterThan(0);
    expect(box!.y + box!.height).toBeLessThan(height);
    expect(box!.width).toBeGreaterThan(width * 0.7);
    expect(await page.locator(".story-workspace, .story-inspector, .story-sidebar").evaluateAll((elements) => elements.every((element) => element.scrollHeight <= element.clientHeight + 1))).toBe(true);
    expect(await page.locator(".story-app-body").evaluate((element) => {
      const bottom = element.getBoundingClientRect().bottom;
      return Array.from(element.querySelectorAll(".story-matrix-footer, .story-receipt > p")).every((child) => child.getBoundingClientRect().bottom <= bottom + 1);
    })).toBe(true);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    if (width === 1366) await page.screenshot({ path: ".artifacts/story-laptop.png" });
  }
});

test("compact viewports use the readable vertical fallback without a sticky scroll distance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [width, height] of [[320, 844], [390, 844], [820, 900], [1280, 640]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".marketing-site")).toHaveAttribute("data-motion-ready", "true");
    await expect(page.locator("[data-workflow-story]")).toHaveAttribute("data-story-mode", "static");
    await expect(page.locator("[data-story-window]")).toHaveCount(0);
    await expect(page.locator("[data-story-fallback]")).toBeVisible();
    await expect(page.locator("[data-story-fallback] h2")).toHaveCount(3);
    expect(await page.locator("[data-workflow-story]").evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(2500);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
  }
});

test("the shared reduced-motion preference replaces the scroll story with static stages", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("[data-story-window]")).toHaveCount(1);
  await scrollStory(page, 0.55);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-story-viewport]")).toHaveCSS("display", "none");
  await expect(page.locator("[data-story-fallback]")).toHaveCSS("display", "block");
  await expect(page.locator("#receipt-title")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ media: "screen" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-workflow-story]")).toHaveAttribute("data-story-mode", "static");
  await expect(page.locator("[data-story-window]")).toHaveCount(0);
  await expect(page.locator("[data-story-fallback]")).toBeVisible();
  await expect(page.locator("#matrix-title, #upload-title, #receipt-title")).toHaveCount(3);
  for (const id of ["matrix-title", "upload-title", "receipt-title"]) await expect(page.locator(`#${id}`)).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.screenshot({ path: ".artifacts/story-reduced.png", fullPage: true });

  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const staticPage = await context.newPage();
    await staticPage.goto("http://127.0.0.1:3100/");
    await expect(staticPage.locator("[data-workflow-story]")).toHaveAttribute("data-story-mode", "static");
    await expect(staticPage.locator("[data-story-fallback] h2")).toHaveCount(3);
    await expect(staticPage.locator("#receipt-title")).toHaveCSS("opacity", "1");
  } finally { await context.close(); }
});
