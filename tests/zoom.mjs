import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  await page.goto("http://localhost:5173");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Disappear into the scene" })
    .uncheck();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const clip = { x: 300, y: 180, width: 800, height: 420 };
  await page.waitForTimeout(1000);
  const before = await page.screenshot({ clip });
  await page.mouse.move(550, 340);
  await page.mouse.wheel(0, -600);
  await expect
    .poll(() => page.locator("#zoom").inputValue().then(Number))
    .toBeGreaterThan(1.5);
  const after = await page.screenshot({ clip });
  expect(before.equals(after)).toBe(false);
  await page.keyboard.press("+");
  await expect
    .poll(() => page.locator("#zoom").inputValue().then(Number))
    .toBeGreaterThan(2);
  await page.keyboard.press("0");
  await expect(page.locator("#zoom")).toHaveValue("1");
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("slider", { name: "Scene zoom", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(page.locator("#zoom-value")).toHaveText("6.0×");
  await page.mouse.move(1270, 440);
  await page.mouse.wheel(0, 100);
  await expect(page.locator("#zoom")).toHaveValue("6");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.locator("#zoom-value")).toHaveText("1.0×");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.mouse.move(550, 340);
  await page.mouse.wheel(0, -500);
  const savedZoom = await page.locator("#zoom").inputValue();
  await page.getByLabel("Choose a world").selectOption("aurora");
  await expect(page.getByLabel("Choose a world")).toBeEnabled();
  await expect(page.locator("#zoom")).toHaveValue(savedZoom);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  await expect(page.locator("#zoom")).toHaveValue(savedZoom);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("0");
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 145, y: 350, id: 1 },
      { x: 245, y: 350, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 95, y: 350, id: 1 },
      { x: 295, y: 350, id: 2 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => page.locator("#zoom").inputValue().then(Number))
    .toBeGreaterThan(1.8);
  await page.screenshot({
    path: "test-results/zoom-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Choose a world").selectOption("cosmic");
  await expect(page.getByLabel("Choose a world")).toBeEnabled();
  await page.waitForTimeout(3000);
  await page.keyboard.press("h");
  await page.screenshot({
    path: "test-results/zoom-desktop.png",
    animations: "disabled",
  });
  await page.mouse.wheel(0, -100);
  await expect(page.locator("body")).not.toHaveClass("quiet");
  await expect(page.locator("#error")).toBeHidden();
  expect(errors).toEqual([]);
  console.log(
    "PASS: wheel, keyboard, slider, reset, persistence, preset changes, resize, touch pinch, hidden controls, and rendered zoom; no browser errors.",
  );
} finally {
  await browser.close();
}
