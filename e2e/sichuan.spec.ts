import { expect, test } from "@playwright/test";

test("sichuan mode: choose missing suit, then play begins", async ({ page }) => {
  await page.goto("/sichuan");

  // Missing-suit overlay appears first.
  await expect(page.getByLabel("定缺")).toBeVisible();
  await expect(page.getByTestId("sc-missing-m")).toBeVisible();

  // Choose to be missing 条 (s).
  await page.getByTestId("sc-missing-s").click();

  // Overlay closes and the table shows your hand and tiles.
  await expect(page.getByLabel("定缺")).toHaveCount(0);
  await expect(page.getByLabel("你的手牌")).toBeVisible();

  const tileImages = page.locator(".hand-row .tile-face__image");
  await expect(tileImages.first()).toBeVisible();
  await expect(tileImages.first()).toHaveAttribute("src", /\/tiles\/.+\.svg$/);

  // No honor tiles should ever appear in Sichuan mode.
  const srcs = await tileImages.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLImageElement).getAttribute("src") ?? ""),
  );
  for (const src of srcs) {
    expect(src).toMatch(/\/tiles\/[mps]\d\.svg$/);
  }
});

test("sichuan mode: shares the classic table layout and Sichuan branding", async ({ page }) => {
  await page.goto("/sichuan");
  await page.getByTestId("sc-missing-m").click();

  await expect(page.getByLabel("川麻牌桌")).toBeVisible();
  await expect(page.locator(".top-bar h1")).toHaveText("川麻");
  await expect(page.locator(".wall-counter")).toContainText("余牌");
  // Reuses the classic table shell class for identical alignment.
  await expect(page.locator(".app-shell.sc-theme")).toBeVisible();
});

test("home page lets you pick a mode and routes by path", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.locator(".home-header h1")).toHaveText("巷口麻将");
  await page.getByRole("button", { name: /川麻/ }).click();
  await expect(page).toHaveURL(/\/sichuan$/);
  await expect(page.getByLabel("定缺")).toBeVisible();
});

test("classic mode is reachable at /classic", async ({ page }) => {
  await page.goto("/classic");
  await expect(page.getByLabel("你的手牌")).toBeVisible();
  await expect(page.locator(".top-bar h1")).toHaveText("巷口麻将");
});
