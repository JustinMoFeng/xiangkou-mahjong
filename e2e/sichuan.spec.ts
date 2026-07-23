import { expect, test } from "@playwright/test";

test("sichuan mode: choose missing suit, then play begins", async ({ page }) => {
  await page.goto("/?mode=sichuan");

  // Missing-suit overlay appears first.
  await expect(page.getByLabel("定缺")).toBeVisible();
  await expect(page.getByTestId("sc-missing-m")).toBeVisible();

  // Choose to be missing 条 (s).
  await page.getByTestId("sc-missing-s").click();

  // Overlay closes and the table shows your hand and tiles.
  await expect(page.getByLabel("定缺")).toHaveCount(0);
  await expect(page.getByLabel("你的手牌")).toBeVisible();

  const tileImages = page.locator(".sc-tile-img");
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

test("sichuan mode: renders 108-tile wall counter and Sichuan branding", async ({ page }) => {
  await page.goto("/?mode=sichuan");
  await page.getByTestId("sc-missing-m").click();

  await expect(page.getByLabel("川麻牌桌")).toBeVisible();
  await expect(page.locator(".sc-top h1")).toHaveText("川麻");
  await expect(page.locator(".sc-wall")).toContainText("余牌");
});

test("home page lets you pick a mode", async ({ page }) => {
  await page.goto("/");
  // No saved mode -> home page (unless a previous test saved one; clear it first).
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.locator(".home-header h1")).toHaveText("巷口麻将");
  await page.getByRole("button", { name: /川麻/ }).click();
  await expect(page.getByLabel("定缺")).toBeVisible();
});
