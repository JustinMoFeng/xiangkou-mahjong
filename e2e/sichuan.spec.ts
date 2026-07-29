import { expect, type Page, test } from "@playwright/test";

type SuitPrefix = "m" | "p" | "s";
type TileCode = `${SuitPrefix}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
type Tile = {
  id: string;
  code: TileCode;
  suit: SuitPrefix;
  rank: number;
  label: string;
  shortLabel: string;
};

const SICHUAN_STORAGE_KEY = "xiangkou-sichuan-save-v1";
const XIANGKOU_STORAGE_KEY = "xiangkou-mahjong-save-v1";
const YANGYANG_STORAGE_KEY = "mahjong-yangyang-save-v1";

function tile(code: TileCode, copy = 0): Tile {
  const suit = code[0] as SuitPrefix;
  const rank = Number(code.slice(1));
  const suffix = suit === "m" ? "万" : suit === "p" ? "筒" : "条";
  return {
    id: `${code}-${copy}`,
    code,
    suit,
    rank,
    label: `${rank}${suffix}`,
    shortLabel: `${rank}`,
  };
}

function tilePicker(): (codes: TileCode[]) => Tile[] {
  const used = new Map<TileCode, number>();
  return (codes) =>
    codes.map((code) => {
      const copy = used.get(code) ?? 0;
      used.set(code, copy + 1);
      return tile(code, copy);
    });
}

function player(
  seat: 0 | 1 | 2 | 3,
  name: string,
  hand: Tile[],
  missingSuit: SuitPrefix,
  type: "human" | "bot" = seat === 0 ? "human" : "bot",
) {
  return {
    seat,
    name,
    type,
    hand,
    drawnTileId: undefined,
    melds: [],
    discards: [] as Tile[],
    score: 100,
    missingSuit,
    hasWon: false,
    winInfo: undefined,
    isTenpai: false,
    isHuazhu: false,
  };
}

async function loadSavedSichuanState(page: Page, state: unknown) {
  await page.addInitScript(
    ({ key, savedState }) => {
      window.localStorage.clear();
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          state: savedState,
        }),
      );
    },
    { key: SICHUAN_STORAGE_KEY, savedState: state },
  );
  await page.goto("/play/sichuan/bot");
}

function basePlayingState() {
  const take = tilePicker();
  return {
    players: [
      player(0, "你", take(["s1", "m5", "m5", "m1", "m2", "m4", "m8", "m9", "p1", "p3", "p4", "p6", "p8"]), "s"),
      player(1, "下家阿蜀", take(["m5", "m3", "m4", "m6", "m7", "p1", "p2", "p3", "p5", "p6", "p7", "p8", "p9"]), "s"),
      player(2, "对家幺鸡", take(["s2", "m1", "m2", "m3", "m4"]), "s"),
      player(3, "上家老川", take(["s3", "m6", "m7", "m8", "m9"]), "s"),
    ],
    wall: take(["p4", "p5", "p6", "p7", "p8", "p9", "m1", "m2", "m3", "m4"]),
    currentSeat: 0,
    dealerSeat: 0,
    roundNumber: 1,
    phase: "playing",
    missingChosen: true,
    awaitingDiscard: true,
    gangLog: [],
    drawReplacement: false,
    recentAction: "测试局面：有缺先打缺。",
    logs: [{ id: "log-e2e", text: "测试局面：有缺先打缺。" }],
    turn: 4,
    roomId: "LOCAL-SICHUAN",
  };
}

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

  await expect(page.locator(".home-header h1")).toHaveText("麻将游戏合集");
  await expect(page.getByRole("button", { name: "选择巷口麻将" })).toBeVisible();
  await expect(page.getByRole("button", { name: /川麻/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始麻将连连看" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始麻将羊羊消" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始2048" })).toBeVisible();

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

  await page.goto("/");
  await page.getByRole("button", { name: "开始麻将连连看" }).click();
  await expect(page).toHaveURL(/\/play\/link-match$/);
  await expect(page.getByLabel("麻将连连看")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "开始麻将羊羊消" }).click();
  await expect(page).toHaveURL(/\/play\/yangyang$/);
  await expect(page.getByLabel("麻将羊羊消关卡选择")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "开始2048" }).click();
  await expect(page).toHaveURL(/\/play\/2048$/);
  await expect(page.getByLabel("2048棋盘")).toBeVisible();
});

test("mahjong table rounds survive a browser refresh", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  await page.goto("/play/xiangkou/bot");
  await expect(page.getByLabel("巷口麻将牌桌")).toBeVisible();
  await page.getByTestId("drawn-tile").click();
  await expect(page.getByLabel("你河牌").locator("img")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("巷口麻将牌桌")).toBeVisible();
  await expect(page.getByLabel("你河牌").locator("img")).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}")?.state?.players?.[0]?.discards?.length, XIANGKOU_STORAGE_KEY))
    .toBe(1);

  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/play/sichuan/bot");
  await expect(page.getByLabel("定缺")).toBeVisible();
  await page.getByTestId("sc-missing-s").click();
  await expect(page.getByLabel("定缺")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("川麻牌桌")).toBeVisible();
  await expect(page.getByLabel("定缺")).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}")?.state?.phase, SICHUAN_STORAGE_KEY))
    .toBe("playing");
});

test("home and mode selection fit short mobile landscape browser viewports", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "short mobile viewport matrix only needs one Chromium project");

  const assertHomeLayout = async (label: string, minCardHeight: number) => {
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const overlapArea = (first: ReturnType<typeof rect>, second: ReturnType<typeof rect>) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      const insideViewport = (bounds: ReturnType<typeof rect>) =>
        bounds.left >= -1 &&
        bounds.top >= -1 &&
        bounds.right <= window.innerWidth + 1 &&
        bounds.bottom <= window.innerHeight + 1;
      const cards = Array.from(document.querySelectorAll(".home-card")).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      });
      const overlaps = cards.flatMap((card, index) =>
        cards.slice(index + 1).map((other) => overlapArea(card, other)),
      );

      return {
        noOverflow:
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          document.documentElement.scrollHeight <= window.innerHeight + 1,
        frameInside: insideViewport(rect(".home-frame")),
        cardsInside: cards.every(insideViewport),
        cardCount: cards.length,
        cardOverlap: Math.max(0, ...overlaps),
        minCardHeight: Math.min(...cards.map((card) => card.height)),
      };
    });

    expect(layout, label).toEqual({
      noOverflow: true,
      frameInside: true,
      cardsInside: true,
      cardCount: label.includes(" home") ? 4 : 2,
      cardOverlap: 0,
      minCardHeight: expect.any(Number),
    });
    expect(layout.minCardHeight, label).toBeGreaterThanOrEqual(minCardHeight);
  };

  for (const viewport of [
    { width: 740, height: 320 },
    { width: 802, height: 293 },
  ]) {
    await page.setViewportSize(viewport);

    await page.goto("/");
    const minCardHeight = viewport.height <= 300 ? 46 : 54;
    await assertHomeLayout(`${viewport.width}x${viewport.height} home`, minCardHeight);

    await page.getByRole("button", { name: "选择巷口麻将" }).click();
    await expect(page).toHaveURL(/\/game\/xiangkou$/);
    await assertHomeLayout(`${viewport.width}x${viewport.height} xiangkou`, minCardHeight);

    await page.goto("/");
    await page.getByRole("button", { name: /川麻/ }).click();
    await expect(page).toHaveURL(/\/game\/sichuan$/);
    await assertHomeLayout(`${viewport.width}x${viewport.height} sichuan`, minCardHeight);
  }
});

test("casual games enter and support first interactions", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/play/link-match?seed=23");
  await expect(page.getByLabel("麻将连连看关卡选择")).toBeVisible();
  await expect(page.locator("[aria-label='连连看关卡']").getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /入门/ })).toContainText("8x6 / 48张");
  await expect(page.getByRole("button", { name: /专家/ })).toContainText("12x12 / 144张");
  await expect(page.getByRole("button", { name: /无尽/ })).toContainText("12x12内循环");

  await page.getByRole("button", { name: /普通/ }).click();
  await expect(page.getByLabel("麻将连连看")).toBeVisible();
  const normalTileCount = await page.getByTestId("link-tile").count();
  expect(normalTileCount).toBeGreaterThanOrEqual(56);
  expect(normalTileCount).toBeLessThanOrEqual(64);
  const normalCodes = await page.getByTestId("link-tile").evaluateAll((nodes) =>
    Array.from(new Set(nodes.map((node) => (node as HTMLElement).dataset.code ?? ""))).length,
  );
  expect(normalCodes).toBeLessThanOrEqual(8);

  await page.getByRole("button", { name: /提示/ }).click();
  await expect(page.getByTestId("link-path")).toBeVisible();
  const hintedLinkTiles = page.locator(".link-tile.is-hinted");
  await expect(hintedLinkTiles).toHaveCount(2);
  const hintedIds = await hintedLinkTiles.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.tileId ?? ""),
  );
  await page.locator(`[data-tile-id="${hintedIds[0]}"]`).click();
  await page.locator(`[data-tile-id="${hintedIds[1]}"]`).click();
  await expect(page.locator(".link-tile.is-removed")).toHaveCount(2);
  await expect(page.getByTestId("link-path")).toBeVisible();
  await expect(page.getByTestId("link-path")).toHaveCount(0, { timeout: 1500 });

  await page.getByLabel("返回关卡").click();
  await expect(page.getByLabel("麻将连连看关卡选择")).toBeVisible();

  await page.goto("/play/yangyang");
  await expect(page.getByLabel("麻将羊羊消关卡选择")).toBeVisible();
  await expect(page.locator("[aria-label='羊羊消关卡']").getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /简单/ })).toContainText("随机堆型");
  await expect(page.getByRole("button", { name: /中等/ })).toContainText("随机堆型");
  await expect(page.getByRole("button", { name: /困难/ })).toContainText("随机堆型");
  await expect(page.getByRole("button", { name: /噩梦/ })).toContainText("随机堆型");
  await expect(page.getByRole("button", { name: /地狱/ })).toContainText("随机堆型");
  await expect(page.getByRole("button", { name: /无尽模式/ })).toContainText("随机难度");

  await page.getByRole("button", { name: /^中等/ }).click();
  await expect(page).toHaveURL(/\/play\/yangyang\?level=normal$/);
  await expect(page.getByLabel("麻将羊羊消")).toBeVisible();
  await expect(page.getByTestId("yang-tile")).toHaveCount(45);
  const blockedTiles = page.locator('[data-testid="yang-tile"][data-blocked="true"]');
  await expect(blockedTiles.first()).toBeDisabled();

  await page.goto("/play/yangyang?level=triple");
  await expect(page.getByLabel("麻将羊羊消")).toBeVisible();
  await expect(page.locator('[data-testid="yang-tile"][data-blocked="true"]').first()).toBeDisabled();
  const tripleTiles = page.locator('[data-testid="yang-tile"][data-code="m1"]');
  await expect(tripleTiles).toHaveCount(3);
  await tripleTiles.nth(0).click();
  await tripleTiles.nth(1).click();
  await tripleTiles.nth(2).click();
  await expect(page.locator(".yang-slot.is-filled")).toHaveCount(0);
});

test("yangyang current round survives a browser refresh", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/play/yangyang?level=easy-castle");
  await expect(page.getByLabel("麻将羊羊消")).toBeVisible();

  await page.locator('[data-testid="yang-tile"][data-blocked="false"]').first().click();
  await expect(page.locator(".yang-slot.is-filled")).toHaveCount(1);
  await expect(page.getByText("步数 1")).toBeVisible();
  await page.reload();

  await expect(page.getByLabel("麻将羊羊消")).toBeVisible();
  await expect(page.locator(".yang-slot.is-filled")).toHaveCount(1);
  await expect(page.getByText("步数 1")).toBeVisible();
  await expect
    .poll(async () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}")?.state?.moves, YANGYANG_STORAGE_KEY))
    .toBe(1);
});

test("yangyang twin towers keep same-layer tiles separate at rendered size", async ({ page }) => {
  await page.goto("/play/yangyang?level=hell-twin-towers&seed=17");
  await expect(page.getByLabel("麻将羊羊消")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="yang-tile"][data-zone="main"]')).map(
      (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          layer: Number(element.style.getPropertyValue("--yang-layer")),
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      },
    );
    const overlapArea = (first: (typeof tiles)[number], second: (typeof tiles)[number]) =>
      Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
      Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    const sameLayerOverlaps = tiles.flatMap((tile, index) =>
      tiles.slice(index + 1).filter((other) => other.layer === tile.layer && overlapArea(tile, other) > 0.5),
    );

    return {
      sameLayerOverlapCount: sameLayerOverlaps.length,
      aspectRatios: tiles.map((tile) => tile.height / tile.width),
    };
  });

  expect(geometry.sameLayerOverlapCount).toBe(0);
  expect(geometry.aspectRatios.every((ratio) => ratio > 1.3 && ratio < 1.35)).toBe(true);
});

test("link match records best time and advances through presets", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/play/link-match?level=tiny-test&seed=23");

  const tinyTiles = page.getByTestId("link-tile");
  await expect(tinyTiles).toHaveCount(2);
  await tinyTiles.nth(0).click();
  await tinyTiles.nth(1).click();

  await expect(page.getByRole("dialog", { name: "连连看结算" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下一关" })).toBeVisible();
  await expect.poll(async () =>
    page.evaluate(() => JSON.parse(window.localStorage.getItem("mahjong-link-match-best-times-v1") ?? "{}")["tiny-test"]),
  ).toBeGreaterThan(0);

  await page.getByRole("button", { name: "下一关" }).click();
  const nextTileCount = await page.getByTestId("link-tile").count();
  expect(nextTileCount).toBeGreaterThanOrEqual(56);
  expect(nextTileCount).toBeLessThanOrEqual(64);
});

test("casual games fit short mobile landscape browser viewports", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "short casual viewport matrix only needs one Chromium project");

  const assertCasualLayout = async (
    label: string,
    route: string,
    frameSelector: string,
    playSelector: string,
    controlSelector = ".casual-topbar",
  ) => {
    await page.goto(route);
    const layout = await page.evaluate(
      ({ frameSelector, playSelector, controlSelector }) => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        const insideViewport = (bounds: ReturnType<typeof rect>) =>
          bounds.left >= -1 &&
          bounds.top >= -1 &&
          bounds.right <= window.innerWidth + 1 &&
          bounds.bottom <= window.innerHeight + 1;

        return {
          noOverflow:
            document.documentElement.scrollWidth <= window.innerWidth + 1 &&
            document.documentElement.scrollHeight <= window.innerHeight + 1,
          frameInside: insideViewport(rect(frameSelector)),
          playInside: insideViewport(rect(playSelector)),
          controlInside: insideViewport(rect(controlSelector)),
        };
      },
      { frameSelector, playSelector, controlSelector },
    );

    expect(layout, label).toEqual({
      noOverflow: true,
      frameInside: true,
      playInside: true,
      controlInside: true,
    });
  };

  for (const viewport of [
    { width: 740, height: 320 },
    { width: 802, height: 293 },
  ]) {
    await page.setViewportSize(viewport);
    await assertCasualLayout(
      `${viewport.width}x${viewport.height} link levels`,
      "/play/link-match",
      ".link-level-select",
      ".link-level-grid",
      ".link-level-select__top",
    );
    await assertCasualLayout(
      `${viewport.width}x${viewport.height} link board`,
      "/play/link-match?level=diamond",
      ".link-game-frame",
      "[data-testid='link-board-viewport']",
    );
    await assertCasualLayout(
      `${viewport.width}x${viewport.height} yang levels`,
      "/play/yangyang",
      ".yang-level-select",
      ".yang-level-grid",
      ".yang-level-select__top",
    );
    await assertCasualLayout(`${viewport.width}x${viewport.height} yang`, "/play/yangyang?level=easy&seed=10", ".yang-frame", ".yang-stack");
    const yangZones = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
      };
      const overlap = (first: ReturnType<typeof rect>, second: ReturnType<typeof rect>) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      const main = rect(".yang-pile--main");
      const left = rect(".yang-pile--support-left");
      const right = rect(".yang-pile--support-right");
      const mainTiles = Array.from(document.querySelectorAll('[data-testid="yang-tile"][data-zone="main"]')).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
      });
      const tilesInsideMain = mainTiles.every(
        (tile) =>
          tile.left >= main.left - 1 &&
          tile.top >= main.top - 1 &&
          tile.right <= main.right + 1 &&
          tile.bottom <= main.bottom + 1,
      );

      return {
        mainLeft: overlap(main, left),
        mainRight: overlap(main, right),
        supports: overlap(left, right),
        tilesInsideMain,
      };
    });
    expect(yangZones, `${viewport.width}x${viewport.height} yang zones`).toEqual({
      mainLeft: 0,
      mainRight: 0,
      supports: 0,
      tilesInsideMain: true,
    });
    await assertCasualLayout(
      `${viewport.width}x${viewport.height} 2048`,
      "/play/2048",
      ".twenty48-frame",
      ".twenty48-board-wrap",
      ".twenty48-topbar",
    );
  }
});

test("link match large boards pan on mobile landscape", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile-landscape", "touch panning is checked in the mobile landscape project");

  await page.goto("/play/link-match?level=endless");
  await expect(page.getByLabel("麻将连连看")).toBeVisible();

  const before = await page.evaluate(() => {
    const viewport = document.querySelector("[data-testid='link-board-viewport']");
    if (!viewport) throw new Error("Missing link board viewport");
    return {
      clientWidth: viewport.clientWidth,
      clientHeight: viewport.clientHeight,
      scrollWidth: viewport.scrollWidth,
      scrollHeight: viewport.scrollHeight,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  });

  expect(
    before.scrollWidth > before.clientWidth || before.scrollHeight > before.clientHeight,
    "large board should be pannable in at least one axis",
  ).toBe(true);

  const viewportBox = await page.getByTestId("link-board-viewport").boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(viewportBox!.x + viewportBox!.width / 2, viewportBox!.y + viewportBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportBox!.x + viewportBox!.width / 2 - 120, viewportBox!.y + viewportBox!.height / 2 - 80);
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const viewport = document.querySelector("[data-testid='link-board-viewport']");
    if (!viewport) throw new Error("Missing link board viewport");
    return {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  });

  expect(after.scrollLeft + after.scrollTop).toBeGreaterThan(before.scrollLeft + before.scrollTop);
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

test("sichuan missing-suit discard rule is enforced in the hand UI", async ({ page }) => {
  await loadSavedSichuanState(page, basePlayingState());

  const missingTile = page.locator(".hand-row .tile-button").filter({ has: page.locator('img[alt="1条"]') }).first();
  const nonMissingTile = page.locator(".hand-row .tile-button").filter({ has: page.locator('img[alt="5万"]') }).first();

  await expect(missingTile).toBeEnabled();
  await expect(nonMissingTile).toBeDisabled();
  await expect(nonMissingTile).toHaveAttribute("title", "先打完定缺花色");
});

test("sichuan can pong non-missing tiles before clearing the missing suit", async ({ page }) => {
  const state = basePlayingState();
  const discard = tile("m5", 2);
  state.players[1].discards = [discard];
  state.lastDiscard = { tile: discard, seat: 1 };
  state.pendingClaim = {
    id: "claim-e2e-pong",
    from: 1,
    tile: discard,
    seat: 0,
    options: [
      {
        id: "pong-e2e-m5",
        action: "pong",
        label: "碰",
        handTileIds: [state.players[0].hand[1].id, state.players[0].hand[2].id],
        previewTileCodes: ["m5", "m5", "m5"],
      },
    ],
  };
  state.awaitingDiscard = false;
  state.recentAction = "你可以操作 下家阿蜀 打出的 5万";

  await loadSavedSichuanState(page, state);

  await expect(page.getByTestId("sc-claim-pong")).toBeVisible();
  await page.getByTestId("sc-claim-pong").click();

  await expect(page.locator(".recent-action")).toContainText("你碰了 下家阿蜀 的 5万");
  await expect(page.getByLabel("副露").first()).toContainText("碰");
  await expect(page.locator(".hand-row .tile-button").filter({ has: page.locator('img[alt="1条"]') }).first()).toBeEnabled();
  await expect(page.locator(".hand-row .tile-button").filter({ has: page.locator('img[alt="1万"]') }).first()).toBeDisabled();
});

test("sichuan bot continues after a replacement draw from exposed kong", async ({ page }) => {
  const take = tilePicker();
  const state = basePlayingState();
  state.players[2] = player(
    2,
    "对家幺鸡",
    take(["m5", "m8", "m8", "m8", "s6", "s7", "s8", "s8"]),
    "p",
  );
  state.players[2].drawnTileId = state.players[2].hand[state.players[2].hand.length - 1].id;
  state.players[2].melds = [
    {
      kind: "kong-exposed",
      from: 1,
      code: "m7",
      tiles: take(["m7", "m7", "m7", "m7"]),
    },
  ];
  state.currentSeat = 2;
  state.awaitingDiscard = true;
  state.drawReplacement = true;
  state.wall = take(["p8", "s5", "s3"]);
  state.recentAction = "刮风：对家幺鸡直杠 7万，下家阿蜀付 2";
  state.logs = [{ id: "log-e2e-kong", text: state.recentAction }];

  await loadSavedSichuanState(page, state);

  await expect(page.locator(".recent-action")).not.toContainText("刮风：对家幺鸡直杠 7万", { timeout: 2500 });
  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}")?.state, SICHUAN_STORAGE_KEY);
  expect(saved.players[2].discards.length).toBeGreaterThan(0);
  expect(saved.awaitingDiscard).toBe(false);
});

test("sichuan short mobile landscape keeps the hand playable under browser chrome", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "short mobile viewport matrix only needs one Chromium project");

  for (const viewport of [
    { width: 740, height: 320 },
    { width: 802, height: 293 },
  ]) {
    await page.setViewportSize(viewport);
    await loadSavedSichuanState(page, basePlayingState());

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const overlapArea = (first: ReturnType<typeof rect>, second: ReturnType<typeof rect>) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      const insideViewport = (bounds: ReturnType<typeof rect>) =>
        bounds.left >= -1 &&
        bounds.top >= -1 &&
        bounds.right <= window.innerWidth + 1 &&
        bounds.bottom <= window.innerHeight + 1;

      const hand = rect(".hand-row");
      const command = rect(".command-bar");
      const topBar = rect(".top-bar");
      const table = rect(".mahjong-table");
      const firstTile = rect(".hand-row .tile-button");

      return {
        noOverflow:
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          document.documentElement.scrollHeight <= window.innerHeight + 1,
        tableInside: insideViewport(table),
        topInside: insideViewport(topBar),
        handInside: insideViewport(hand),
        commandInside: insideViewport(command),
        commandClearOfHand: overlapArea(command, hand) === 0,
        topClearOfTableCenter: topBar.bottom <= table.top + 32,
        tileHeight: firstTile.height,
      };
    });

    expect(layout, `${viewport.width}x${viewport.height}`).toEqual({
      noOverflow: true,
      tableInside: true,
      topInside: true,
      handInside: true,
      commandInside: true,
      commandClearOfHand: true,
      topClearOfTableCenter: true,
      tileHeight: expect.any(Number),
    });
    expect(layout.tileHeight, `${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(41);
  }
});
