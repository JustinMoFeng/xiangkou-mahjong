import { expect, test } from "@playwright/test";

test("sichuan mode: choose missing suit, then play begins", async ({ page }) => {
  await page.goto("/play/sichuan/bot");

  // Missing-suit picker appears without covering the hand.
  await expect(page.getByLabel("定缺")).toBeVisible();
  await expect(page.getByTestId("sc-missing-m")).toBeVisible();
  await expect(page.getByLabel("你的手牌")).toBeVisible();
  const initialTileImages = page.locator(".hand-row .tile-face__image");
  await expect(initialTileImages).toHaveCount(14);
  const missingPanelLayout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const panel = rect(".sc-missing-panel");
    const hand = rect(".hand-row");
    if (!panel || !hand) return null;
    return {
      overlap:
        Math.max(0, Math.min(panel.right, hand.right) - Math.max(panel.left, hand.left)) *
        Math.max(0, Math.min(panel.bottom, hand.bottom) - Math.max(panel.top, hand.top)),
    };
  });
  expect(missingPanelLayout?.overlap).toBe(0);

  // Choose to be missing 条 (s).
  await page.getByTestId("sc-missing-s").click();

  // Overlay closes and the table shows your hand and tiles.
  await expect(page.getByLabel("定缺")).toHaveCount(0);
  await expect(page.getByLabel("你的手牌")).toBeVisible();

  const tileImages = page.locator(".hand-row .tile-face__image");
  await expect(tileImages).toHaveCount(14);
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
  await page.goto("/play/sichuan/bot");
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
  await page.getByRole("button", { name: "选择巷口麻将" }).click();
  await expect(page).toHaveURL(/\/game\/xiangkou$/);
  await expect(page.getByRole("heading", { name: "选择开桌方式" })).toBeVisible();
  await page.getByRole("button", { name: "进入人机练习" }).click();
  await expect(page).toHaveURL(/\/play\/xiangkou\/bot$/);
  await expect(page.getByLabel("巷口麻将牌桌")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /川麻/ }).click();
  await expect(page).toHaveURL(/\/game\/sichuan$/);
  await expect(page.getByRole("heading", { name: "选择开桌方式" })).toBeVisible();
  await page.getByRole("button", { name: "进入人机血战" }).click();
  await expect(page).toHaveURL(/\/play\/sichuan\/bot$/);
  await expect(page.getByLabel("定缺")).toBeVisible();
});

test("legacy game routes remain reachable", async ({ page }) => {
  await page.goto("/classic");
  await expect(page.getByLabel("你的手牌")).toBeVisible();
  await expect(page.locator(".top-bar h1")).toHaveText("巷口麻将");

  await page.goto("/sichuan");
  await expect(page.getByLabel("定缺")).toBeVisible();
});

test("sichuan rules help explains patterns and settlement", async ({ page }) => {
  await page.goto("/play/sichuan/bot");

  await page.getByLabel("查看川麻帮助").click();
  const dialog = page.getByRole("dialog", { name: "川麻帮助" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("开局定缺");
  await expect(dialog).toContainText("血战到底");
  await expect(dialog).toContainText("七对");
  await expect(dialog).toContainText("清一色");
  await expect(dialog).toContainText("查大叫");

  await page.getByLabel("关闭帮助").click();
  await expect(dialog).toBeHidden();
});
