import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const landscapeViewports = [
  { width: 740, height: 360 },
  { width: 802, height: 293 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1280, height: 720 },
];

async function gotoScenario(page: Page, scenario: string) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(`/?scenario=${scenario}`, { waitUntil: "domcontentloaded" });
}

test("loads real tile images", async ({ page }) => {
  await page.goto("/play/xiangkou/bot");

  await expect(page.getByLabel("你的手牌")).toBeVisible();

  const tileImages = page.locator(".hand-row .tile-face__image");
  await expect(tileImages).toHaveCount(14);
  const visibleTileCount = await tileImages.evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLImageElement;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).length,
  );
  expect(visibleTileCount).toBeGreaterThan(0);
  await expect(tileImages.first()).toHaveAttribute("src", /\/tiles\/.+\.svg$/);
  expect(await tileImages.count()).toBeGreaterThanOrEqual(14);
});

test("desktop table fits the viewport", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "viewport fit is checked with the desktop project");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/play/xiangkou/bot");

  const frame = page.locator(".game-frame");
  await expect(frame).toBeVisible();
  const frameBox = await frame.boundingBox();
  expect(frameBox).not.toBeNull();
  expect(frameBox!.height).toBeLessThanOrEqual(720);
});

test("drawn tile stays at the far right with a gap until the player discards", async ({ page }) => {
  await page.goto("/play/xiangkou/bot");

  const hand = page.locator(".hand-row");
  const drawn = page.getByTestId("drawn-tile");
  await expect(drawn).toHaveCount(1);

  const drawnBox = await drawn.boundingBox();
  const handTiles = page.getByTestId("hand-tile");
  const lastRegularBox = await handTiles.last().boundingBox();
  expect(drawnBox).not.toBeNull();
  expect(lastRegularBox).not.toBeNull();
  expect(drawnBox!.x).toBeGreaterThan(lastRegularBox!.x);
  expect(drawnBox!.x - (lastRegularBox!.x + lastRegularBox!.width)).toBeGreaterThan(6);

  await handTiles.first().click();
  await expect(drawn).toHaveCount(0);
  await expect(hand.locator(".tile-button")).toHaveCount(13);
});

test("mobile landscape layout fits without overflow", async ({ page }) => {
  await page.goto("/play/xiangkou/bot");

  await expect(page.getByLabel("巷口麻将牌桌")).toBeVisible();
  await expect(page.getByLabel("四家河牌")).toBeVisible();
  await expect(page.getByLabel("你的手牌")).toBeVisible();
  await expect(page.getByLabel("你的点数")).toContainText("你 25,000 点");
  await expect(page.getByLabel("横屏提示")).toBeHidden();

  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    vertical: document.documentElement.scrollHeight > window.innerHeight + 1,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });
});

test("all supported landscape sizes keep seats, rivers, commands and hand separated", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "the viewport matrix only needs one Chromium project");

  for (const viewport of landscapeViewports) {
    await page.setViewportSize(viewport);
    await gotoScenario(page, "multi-chow");

    await expect(page.getByLabel("四人麻将桌")).toBeVisible();
    await expect(page.getByTestId("hand-tile")).toHaveCount(13);
    await expect(page.getByTestId("claim-option-chow")).toHaveCount(3);

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing layout element: ${selector}`);
        }

        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      };
      const overlapArea = (
        first: ReturnType<typeof rect>,
        second: ReturnType<typeof rect>,
      ) =>
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      const viewportBounds = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
      const isInside = (inner: ReturnType<typeof rect>, outer: ReturnType<typeof rect>) =>
        inner.left >= outer.left - 1 &&
        inner.top >= outer.top - 1 &&
        inner.right <= outer.right + 1 &&
        inner.bottom <= outer.bottom + 1;

      const table = rect(".mahjong-table");
      const hand = rect(".hand-row");
      const command = rect(".command-bar");
      const action = rect(".recent-action");
      const seats = [rect(".table-seat--top"), rect(".table-seat--left"), rect(".table-seat--right")];
      const sideRacks = {
        left: rect(".table-seat--left .table-seat__rack"),
        right: rect(".table-seat--right .table-seat__rack"),
      };
      const rivers = [
        rect(".river-zone--top"),
        rect(".river-zone--left"),
        rect(".river-zone--right"),
        rect(".river-zone--bottom"),
      ];
      const handTiles = Array.from(document.querySelectorAll(".hand-row .tile-button")).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      });

      return {
        noOverflow:
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          document.documentElement.scrollHeight <= window.innerHeight + 1,
        seatsInsideTable: seats.every((seat) => isInside(seat, table)),
        handTilesVisible: handTiles.every((tile) => isInside(tile, viewportBounds)),
        commandVisible: isInside(command, viewportBounds),
        commandClearOfHand: overlapArea(command, hand) === 0,
        actionClearOfHand: overlapArea(action, hand) === 0,
        sideRacksOnTableEdge:
          sideRacks.left.left - table.left <= 10 &&
          table.right - sideRacks.right.right <= 10 &&
          sideRacks.left.bottom - sideRacks.left.top > sideRacks.left.right - sideRacks.left.left &&
          sideRacks.right.bottom - sideRacks.right.top > sideRacks.right.right - sideRacks.right.left,
        riverOverlaps: [
          overlapArea(rivers[0], rivers[1]),
          overlapArea(rivers[0], rivers[2]),
          overlapArea(rivers[3], rivers[1]),
          overlapArea(rivers[3], rivers[2]),
        ],
      };
    });

    expect(layout, `${viewport.width}x${viewport.height}`).toEqual({
      noOverflow: true,
      seatsInsideTable: true,
      handTilesVisible: true,
      commandVisible: true,
      commandClearOfHand: true,
      actionClearOfHand: true,
      sideRacksOnTableEdge: true,
      riverOverlaps: [0, 0, 0, 0],
    });
  }
});

test("mobile portrait shows rotate prompt instead of squeezed table", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "portrait prompt is checked with Chromium viewport override");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play/xiangkou/bot");

  await expect(page.getByLabel("横屏提示")).toBeVisible();
  await expect(page.getByLabel("横屏提示")).toContainText("请横屏游玩");
  await expect(page.getByLabel("巷口麻将牌桌")).toBeHidden();
});

test("multiple chow choices are shown and highlight the exact hand tiles", async ({ page }) => {
  await gotoScenario(page, "multi-chow");

  const chowOptions = page.getByTestId("claim-option-chow");
  await expect(chowOptions).toHaveCount(3);
  await expect(chowOptions.nth(0)).toContainText("吃 3筒4筒5筒");
  await expect(chowOptions.nth(1)).toContainText("吃 4筒5筒6筒");
  await expect(chowOptions.nth(2)).toContainText("吃 5筒6筒7筒");

  await chowOptions.nth(1).hover();
  await expect(page.locator(".tile-face.is-highlighted")).toHaveCount(2);

  await chowOptions.nth(1).click();
  const humanHand = page.getByLabel("你的手牌");
  await expect(humanHand.getByLabel("副露")).toContainText("吃");
  await expect(page.getByTestId("claim-option-chow")).toHaveCount(0);
  await expect(page.getByLabel(/操作倒计时/)).toHaveCount(0);
});

test("bot can pong from real hand tiles after the player discards", async ({ page }) => {
  await gotoScenario(page, "bot-pong");

  await page.getByTitle("打出红中").click();
  const rightOpponent = page.getByLabel("阿南区域");
  await expect(rightOpponent.getByLabel("副露")).toContainText("碰");
  await expect(rightOpponent.locator(".table-seat__rack").getByLabel("副露")).toContainText("碰");
  await expect(page.locator(".recent-action")).toContainText("阿南碰了 你 的 红中");
});

test("opponent racks and meld tiles face the correct table direction", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "direction matrix is checked once in Chromium");
  await page.setViewportSize({ width: 932, height: 430 });

  const readRotations = () =>
    page.evaluate(() => {
    const readRotation = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing directed tile: ${selector}`);
      }

      const transform = getComputedStyle(element).transform;
      if (transform === "none") {
        return 0;
      }

      const match = transform.match(/matrix\(([^)]+)\)/);
      if (!match) {
        throw new Error(`Unexpected transform: ${transform}`);
      }

      const [a, b] = match[1].split(",").map((part) => Number(part.trim()));
      return Math.round(Math.atan2(b, a) * (180 / Math.PI));
    };

    return {
      topBack: readRotation(".table-seat--top .tile-back"),
      leftBack: readRotation(".table-seat--left .tile-back"),
      rightBack: readRotation(".table-seat--right .tile-back"),
    };
  });

  await gotoScenario(page, "multi-chow");
  await expect(page.locator(".table-seat--top .tile-back")).not.toHaveCount(0);
  await expect(page.locator(".table-seat--left .tile-back")).not.toHaveCount(0);
  await expect(page.locator(".table-seat--right .tile-back")).not.toHaveCount(0);
  const rackRotations = await readRotations();
  const leftRiverRotation = await page.evaluate(() => {
    const element = document.querySelector(".river-zone--left .tile-face");
    if (!element) {
      throw new Error("Missing upstream river tile");
    }
    const [a, b] = getComputedStyle(element)
      .transform.match(/matrix\(([^)]+)\)/)![1]
      .split(",")
      .map((part) => Number(part.trim()));
    return Math.round(Math.atan2(b, a) * (180 / Math.PI));
  });

  expect(rackRotations).toEqual({
    topBack: 180,
    leftBack: 90,
    rightBack: -90,
  });
  expect(leftRiverRotation).toBe(90);

  await gotoScenario(page, "bot-pong");
  await page.getByTitle("打出红中").click();
  await expect(page.getByLabel("阿南区域").getByLabel("副露")).toContainText("碰");
  const rightMeldRotation = await page.evaluate(() => {
    const element = document.querySelector(".table-seat--right .meld-row .tile-face");
    if (!element) {
      throw new Error("Missing downstream meld tile");
    }
    const [a, b] = getComputedStyle(element)
      .transform.match(/matrix\(([^)]+)\)/)![1]
      .split(",")
      .map((part) => Number(part.trim()));
    return Math.round(Math.atan2(b, a) * (180 / Math.PI));
  });
  expect(rightMeldRotation).toBe(-90);
});

test("side rivers run along each player's edge and meld spacing matches concealed tiles", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "layout geometry is checked once in Chromium");
  await page.setViewportSize({ width: 932, height: 430 });
  await gotoScenario(page, "river-layout");

  const riverLayout = await page.evaluate(() => {
    const rects = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        };
      });
    const within = (actual: number, expected: number, tolerance = 2) => Math.abs(actual - expected) <= tolerance;
    const isSideRiverColumn = (tiles: ReturnType<typeof rects>) =>
      tiles.length >= 8 &&
      tiles.slice(0, 6).every((tile) => within(tile.x, tiles[0].x)) &&
      tiles.slice(1, 6).every((tile, index) => tile.y > tiles[index].y) &&
      tiles[6].x > tiles[0].x &&
      within(tiles[6].y, tiles[0].y);

    return {
      leftColumn: isSideRiverColumn(rects(".river-zone--left .tile-face")),
      rightColumn: isSideRiverColumn(rects(".river-zone--right .tile-face")),
    };
  });

  expect(riverLayout).toEqual({
    leftColumn: true,
    rightColumn: true,
  });

  await gotoScenario(page, "bot-pong");
  await page.getByTitle("打出红中").click();
  await expect(page.getByLabel("阿南区域").getByLabel("副露")).toContainText("碰");

  const meldLayout = await page.evaluate(() => {
    const rects = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        };
      });
    const step = (items: ReturnType<typeof rects>) => Math.round(items[1].y - items[0].y);
    const meldTiles = rects(".table-seat--right .meld-set .tile-face");
    const backs = rects(".table-seat--right .tile-back");

    return {
      sameWidth: meldTiles[0].width === backs[0].width,
      sameHeight: meldTiles[0].height === backs[0].height,
      sameStep: step(meldTiles) === step(backs),
    };
  });

  expect(meldLayout).toEqual({
    sameWidth: true,
    sameHeight: true,
    sameStep: true,
  });
});

test("human melds use hand-sized tiles while robot melds match their concealed racks", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "meld geometry is checked once in Chromium");
  await page.setViewportSize({ width: 932, height: 430 });
  await gotoScenario(page, "meld-layout");

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing meld geometry element: ${selector}`);
      }
      const bounds = element.getBoundingClientRect();
      return {
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    };
    const sameSize = (first: ReturnType<typeof rect>, second: ReturnType<typeof rect>) =>
      first.width === second.width && first.height === second.height;

    return {
      humanMeldMatchesHand: sameSize(rect(".human-area .meld-set .tile-face"), rect(".hand-row .tile-button .tile-face")),
      topRobotMeldMatchesRack: sameSize(rect(".table-seat--top .meld-set .tile-face"), rect(".table-seat--top .tile-back")),
      leftRobotMeldMatchesRack: sameSize(rect(".table-seat--left .meld-set .tile-face"), rect(".table-seat--left .tile-back")),
      rightRobotMeldMatchesRack: sameSize(rect(".table-seat--right .meld-set .tile-face"), rect(".table-seat--right .tile-back")),
    };
  });

  expect(layout).toEqual({
    humanMeldMatchesHand: true,
    topRobotMeldMatchesRack: true,
    leftRobotMeldMatchesRack: true,
    rightRobotMeldMatchesRack: true,
  });
});

test("bot discards face their own seat and keep the latest tile glowing", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "bot river direction is checked once in Chromium");
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/play/xiangkou/bot");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId("hand-tile").first().click();

  const expectedRotations: Record<string, number> = {
    "river-zone--right": -90,
    "river-zone--top": 180,
    "river-zone--left": 90,
  };
  const seen = new Map<string, { rotation: number; glows: boolean; animationName: string; recent: string }>();

  for (let attempt = 0; attempt < 60 && seen.size < 3; attempt += 1) {
    const passButton = page.getByRole("button", { name: "跳过" });
    if (await passButton.isVisible().catch(() => false)) {
      await passButton.click();
    }

    const snapshot = await page.evaluate(() => {
      const freshTile = document.querySelector(".river-zone .tile-face.is-fresh");
      if (!freshTile) {
        return null;
      }

      const zone = freshTile.closest(".river-zone");
      const zoneClass = Array.from(zone?.classList ?? []).find((className) => className.startsWith("river-zone--"));
      const transform = getComputedStyle(freshTile).transform;
      const rotation =
        transform === "none"
          ? 0
          : (() => {
              const match = transform.match(/matrix\(([^)]+)\)/);
              if (!match) {
                return Number.NaN;
              }
              const [a, b] = match[1].split(",").map((part) => Number(part.trim()));
              return Math.round(Math.atan2(b, a) * (180 / Math.PI));
            })();
      const filter = getComputedStyle(freshTile).filter;

      return {
        zoneClass,
        rotation,
        glows: filter.includes("255, 216, 137"),
        animationName: getComputedStyle(freshTile).animationName,
        recent: document.querySelector(".recent-action")?.textContent?.trim() ?? "",
      };
    });

    if (snapshot?.zoneClass && snapshot.zoneClass in expectedRotations) {
      seen.set(snapshot.zoneClass, {
        rotation: snapshot.rotation,
        glows: snapshot.glows,
        animationName: snapshot.animationName,
        recent: snapshot.recent,
      });
    }

    await page.waitForTimeout(250);
  }

  expect(Object.fromEntries(seen)).toMatchObject({
    "river-zone--right": {
      rotation: expectedRotations["river-zone--right"],
      glows: true,
      animationName: "tile-land-right",
    },
    "river-zone--top": {
      rotation: expectedRotations["river-zone--top"],
      glows: true,
      animationName: "tile-land-top",
    },
    "river-zone--left": {
      rotation: expectedRotations["river-zone--left"],
      glows: true,
      animationName: "tile-land-left",
    },
  });
});

test("normal game persists current round across refresh and exposes settings restart", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/play/xiangkou/bot");

  await expect(page.getByTestId("drawn-tile")).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("drawn-tile")).toHaveCount(1);
  await expect(page.getByText("第 1 局开局。垃圾胡已开启")).toBeVisible();

  await page.getByLabel("设置").click();
  await expect(page.getByLabel("牌桌设置")).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重开本场" })).toBeVisible();
});

test("player names can be edited and persist across refresh", async ({ page }) => {
  await page.goto("/play/xiangkou/bot");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByLabel("设置").click();
  const panel = page.getByLabel("牌桌设置");
  await expect(panel).toBeVisible();
  await panel.getByRole("tab", { name: "改名" }).click();
  await panel.getByLabel("本家名字").fill("老板");
  await panel.getByLabel("下家名字").fill("阿南同学");
  await panel.getByRole("button", { name: "保存名字" }).click();
  await expect(panel.getByLabel("本家名字")).toHaveValue("老板");

  await panel.getByRole("tab", { name: "通用" }).click();
  await panel.getByRole("button", { name: "继续" }).click();
  await expect(page.getByLabel("你的点数")).toContainText("老板");
  await expect(page.getByLabel("阿南同学区域")).toContainText("阿南同学");

  await page.reload();
  await expect(page.getByLabel("你的点数")).toContainText("老板");
  await expect(page.getByLabel("阿南同学区域")).toContainText("阿南同学");
});

test("settings controls stay visible in extreme landscape height", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "the extreme viewport only needs one Chromium project");
  await page.setViewportSize({ width: 802, height: 293 });
  await page.goto("/play/xiangkou/bot");
  await page.getByLabel("设置").click();

  const settingsPanel = page.getByLabel("牌桌设置");
  await expect(settingsPanel).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "重开本场" })).toBeInViewport();
});

test("starts when crypto.randomUUID is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/play/xiangkou/bot");
  await expect(page.getByLabel("四人麻将桌")).toBeVisible();
  await expect(page.getByTestId("drawn-tile")).toHaveCount(1);
});

test("audio toggle enables tile voice announcements", async ({ page }) => {
  await page.addInitScript(() => {
    class MockAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: () => undefined },
          connect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
        };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: MockAudioContext });
    Object.defineProperty(window, "webkitAudioContext", { value: MockAudioContext });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class MockSpeechSynthesisUtterance {
        text: string;
        lang = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        voice?: SpeechSynthesisVoice;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "Audio", {
      value: class MockAudio {
        static played: string[] = [];
        src: string;
        loop = false;
        volume = 1;
        currentTime = 0;
        constructor(src: string) {
          this.src = src;
        }
        play() {
          MockAudio.played.push(this.src);
          return Promise.resolve();
        }
        pause() {
          return undefined;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        spoken: [] as string[],
        cancel: () => undefined,
        getVoices: () => [{ lang: "zh-CN", name: "Mock Chinese Voice" }],
        speak(utterance: SpeechSynthesisUtterance) {
          this.spoken.push(utterance.text);
        },
      },
    });
  });

  await gotoScenario(page, "bot-pong");
  await page.getByLabel("开启声音").click();
  await expect(page.getByLabel("关闭声音")).toBeVisible();
  await page.getByTitle("打出红中").click();

  await page.waitForFunction(() => {
    const spoken = (window.speechSynthesis as unknown as { spoken: string[] }).spoken;
    return spoken.includes("红中") && spoken.includes("碰");
  });
  const spoken = await page.evaluate(() => (window.speechSynthesis as unknown as { spoken: string[] }).spoken);
  const musicPlayed = await page.evaluate(() => (window.Audio as unknown as { played: string[] }).played);
  expect(spoken).toContain("红中");
  expect(spoken).toContain("碰");
  expect(musicPlayed.some((src) => src.endsWith("/audio/mahjong-bgm.mp3"))).toBe(true);
});
