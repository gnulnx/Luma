import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.clock.install();
  await page.goto("http://localhost:5173");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  await expect(page.locator("body")).toHaveClass("quiet", { timeout: 10000 });
  await page.waitForTimeout(12000); // Exercise sustained rendering at a 4K viewport.
  console.log("4K viewport:", await page.locator("#performance").textContent());
  const dimensions = await page
    .locator("canvas")
    .evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(3210000);
  await page.screenshot({
    path: "test-results/cosmic-tv.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.move(500, 300);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("switch", { name: "Let it wander" }).check();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.clock.fastForward(91000);
  await expect(page.getByLabel("Choose a world")).toHaveValue("aurora");
  await expect(page.getByLabel("Choose a world")).toBeEnabled();
  await page.clock.resume();
  await page.mouse.move(600, 400);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByLabel("Detail", { exact: true }).selectOption("ultra");
  await expect(page.locator("#particle-count")).toHaveText("20,000");
  await expect(page.getByLabel("Detail", { exact: true })).toBeEnabled();
  await page.waitForTimeout(2000);
  await expect(page.locator("#error")).toBeHidden();
  expect(errors).toEqual([]);
  console.log(
    "PASS: 4K rendering budget, immersive view, automatic world tour, and Ultra detail.",
  );
} finally {
  await browser.close();
}
