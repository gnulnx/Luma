import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  await page.goto("http://localhost:5173");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  await expect(page.locator("#error")).toBeHidden();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Disappear into the scene" })
    .uncheck();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.waitForTimeout(5000); // Observe the evolving scene after a few seconds of simulation.
  await page.screenshot({
    path: "test-results/cosmic-desktop.png",
    animations: "disabled",
  });
  console.log(
    "First render:",
    await page.locator("#performance").textContent(),
  );
  if (process.env.QUICK_LOOK) {
    console.log({ errors });
    process.exitCode = errors.length ? 1 : 0;
  } else {
    await page
      .getByRole("button", { name: "Pause simulation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume simulation", exact: true }),
    ).toBeVisible();
    const sceneClip = { x: 500, y: 280, width: 500, height: 350 };
    const frozenA = await page.screenshot({ clip: sceneClip });
    await page.waitForTimeout(300);
    const frozenB = await page.screenshot({ clip: sceneClip });
    expect(frozenA.equals(frozenB)).toBe(true);
    await page
      .getByRole("button", { name: "Resume simulation", exact: true })
      .click();
    await page.waitForTimeout(300);
    const moving = await page.screenshot({ clip: sceneClip });
    expect(moving.equals(frozenB)).toBe(false);
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    await page
      .getByLabel("Color palette", { exact: true })
      .selectOption("gold");
    await page.getByLabel("Energy", { exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#speed-value")).toHaveText("1.1×");
    await page.screenshot({
      path: "test-results/settings-desktop.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Restore this world’s defaults" })
      .click();
    await expect(page.getByLabel("Color palette", { exact: true })).toHaveValue(
      "original",
    );
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    const savedEnergy = await page.locator("#speed").inputValue();
    await page.getByLabel("Choose a world").selectOption("aurora");
    await expect(page.getByLabel("Choose a world")).toBeEnabled();
    await expect(page.locator("#speed")).toHaveValue(savedEnergy);
    for (const id of ["aurora", "ocean", "ember", "prism"]) {
      await page.getByLabel("Choose a world").selectOption(id);
      await expect(page.getByLabel("Choose a world")).toBeEnabled();
      await page.waitForTimeout(4500);
      await page.screenshot({
        path: `test-results/${id}-desktop.png`,
        animations: "disabled",
      });
      await expect(page.locator("#error")).toBeHidden();
      console.log(id, await page.locator("#performance").textContent());
    }
    await page
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await page.keyboard.press("f");
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    await page
      .getByRole("switch", { name: "Disappear into the scene" })
      .check();
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await expect(page.locator("body")).toHaveClass("quiet", { timeout: 9000 });
    await page.mouse.move(600, 300);
    await expect(page.locator("body")).not.toHaveClass("quiet");
    await page.keyboard.press("h");
    await expect(page.locator("body")).toHaveClass("quiet");
    await page.keyboard.press("h");
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    await page.getByLabel("Detail", { exact: true }).selectOption("low");
    await expect(page.locator("#particle-count")).toHaveText("5,000");
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
    await expect(page.getByLabel("Choose a world")).toHaveValue("prism");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.mouse.move(200, 400);
    await page.screenshot({
      path: "test-results/mobile.png",
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/settings-mobile.png",
      animations: "disabled",
    });
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page).toBe(dimensions.viewport);
    expect(errors).toEqual([]);
    console.log(
      "PASS: presets, pause, settings, reset, fullscreen, auto-hide, keyboard, quality, persistence, responsive layout; no console errors.",
    );
  }
} finally {
  await browser.close();
}
