export type YangDifficulty = "简单" | "中等" | "困难" | "噩梦" | "地狱" | "无尽";

export type YangLayoutKind = "castle" | "pyramid" | "twin-towers" | "corridor";
export type YangZone = "main" | "support-left" | "support-right";

export type YangLayoutPoint = {
  x: number;
  y: number;
  layer: number;
  zone: YangZone;
};

export type YangLevelPreset = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: YangDifficulty;
  tileCount: number;
  maxLayer: number;
  layoutKinds: YangLayoutKind[];
  endless?: boolean;
};

export type YangResolvedLevel = YangLevelPreset & {
  layoutKind: YangLayoutKind;
  round: number;
};

function rectPoints(
  startX: number,
  startY: number,
  columns: number,
  rows: number,
  layer: number,
  zone: YangZone = "main",
): YangLayoutPoint[] {
  return Array.from({ length: rows }).flatMap((_, row) =>
    Array.from({ length: columns }).map((__, col) => ({
      x: startX + col * 6,
      y: startY + row * 6,
      layer,
      zone,
    })),
  );
}

function supportStack(zone: Extract<YangZone, "support-left" | "support-right">, count: number): YangLayoutPoint[] {
  return Array.from({ length: count }).map((_, index) => ({
    x: index * 0.78,
    y: 0,
    layer: index,
    zone,
  }));
}

function centeredMatrix(side: number, layer: number, centerX = 0, centerY = 0): YangLayoutPoint[] {
  const startX = centerX - ((side - 1) * 6) / 2;
  const startY = centerY - ((side - 1) * 6) / 2;
  return rectPoints(startX, startY, side, side, layer);
}

function pyramidPoints(layers: number): YangLayoutPoint[] {
  return Array.from({ length: layers }).flatMap((_, layer) =>
    centeredMatrix(layers - layer, layer),
  );
}

function castlePoints(layers: number): YangLayoutPoint[] {
  return Array.from({ length: layers }).flatMap((_, layer) => {
    const side = layers - layer;
    return centeredMatrix(side, layer).map((point) => {
      if (side < 3) return point;
      const halfSpan = ((side - 1) * 6) / 2;
      const atLeft = point.x === -halfSpan;
      const atRight = point.x === halfSpan;
      const atTop = point.y === -halfSpan;
      const atBottom = point.y === halfSpan;
      const isCorner = (atLeft || atRight) && (atTop || atBottom);
      if (!isCorner) return point;
      return {
        ...point,
        x: point.x + (atLeft ? -3 : 3),
        y: point.y + (atTop ? -3 : 3),
      };
    });
  });
}

function compactMatrix(count: number, layer: number, centerX: number): YangLayoutPoint[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const points: YangLayoutPoint[] = [];
  let remaining = count;
  for (let row = 0; row < rows; row += 1) {
    const rowCount = Math.min(columns, remaining);
    const startX = centerX - ((rowCount - 1) * 6) / 2;
    const y = (row - (rows - 1) / 2) * 6;
    for (let col = 0; col < rowCount; col += 1) {
      points.push({ x: startX + col * 6, y, layer, zone: "main" });
    }
    remaining -= rowCount;
  }
  return points;
}

function twinTowerPoints(layers: number): YangLayoutPoint[] {
  return Array.from({ length: layers }).flatMap((_, layer) => {
    const side = layers - layer;
    const layerCount = Math.max(2, side * side);
    const leftCount = Math.ceil(layerCount / 2);
    const rightCount = Math.floor(layerCount / 2);
    const towerOffset = Math.max(12, side * 5);
    return [
      ...compactMatrix(leftCount, layer, -towerOffset),
      ...compactMatrix(rightCount, layer, towerOffset),
    ];
  });
}

function ringPoints(width: number, height: number, layer: number): YangLayoutPoint[] {
  const startX = -((width - 1) * 6) / 2;
  const startY = -((height - 1) * 6) / 2;
  const points: YangLayoutPoint[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (row !== 0 && row !== height - 1 && col !== 0 && col !== width - 1) continue;
      points.push({ x: startX + col * 6, y: startY + row * 6, layer, zone: "main" });
    }
  }
  return points;
}

function corridorPoints(layers: number): YangLayoutPoint[] {
  return Array.from({ length: layers }).flatMap((_, layer) => {
    const depth = layers - layer;
    return ringPoints(depth + 2, Math.max(3, depth + 1), layer);
  });
}

function minimumSupportCount(layers: number): number {
  return [0, 0, 5, 6, 7, 7, 8, 8][layers] ?? Math.max(8, layers + 1);
}

function splitSupportCount(mainCount: number, layers: number): [number, number] {
  let supportTotal = minimumSupportCount(layers) * 2;
  while ((mainCount + supportTotal) % 3 !== 0) {
    supportTotal += 1;
  }
  return [Math.ceil(supportTotal / 2), Math.floor(supportTotal / 2)];
}

export function createYangLayoutPoints(level: YangResolvedLevel): YangLayoutPoint[] {
  const layers = level.maxLayer + 1;
  const main = (() => {
    if (level.layoutKind === "pyramid") return pyramidPoints(layers);
    if (level.layoutKind === "twin-towers") return twinTowerPoints(layers);
    if (level.layoutKind === "corridor") return corridorPoints(layers);
    return castlePoints(layers);
  })();
  const [leftSupportCount, rightSupportCount] = splitSupportCount(main.length, layers);

  return [
    ...main,
    ...supportStack("support-left", leftSupportCount),
    ...supportStack("support-right", rightSupportCount),
  ];
}

const YANG_LAYOUTS: Array<{ id: YangLayoutKind; name: string; description: string }> = [
  { id: "castle", name: "城堡", description: "规则方阵逐层内收，主堆深度清晰。" },
  { id: "pyramid", name: "金字塔", description: "上窄下宽的居中嵌套，逐层打开。" },
  { id: "twin-towers", name: "双塔", description: "左右两座深堆并行推进，需要平衡消除。" },
  { id: "corridor", name: "回廊", description: "四组牌堡围合成区，释放路线更多。" },
];

export const YANG_DIFFICULTY_ORDER: Exclude<YangDifficulty, "无尽">[] = [
  "简单",
  "中等",
  "困难",
  "噩梦",
  "地狱",
];

const YANG_DIFFICULTIES: Array<{
  key: string;
  difficulty: Exclude<YangDifficulty, "无尽">;
  tileCount: number;
  maxLayer: number;
  description: string;
}> = [
  { key: "easy", difficulty: "简单", tileCount: 36, maxLayer: 2, description: "3层嵌套，适合熟悉主堆与辅助堆。" },
  { key: "normal", difficulty: "中等", tileCount: 54, maxLayer: 3, description: "4层嵌套，同牌开始跨层释放。" },
  { key: "hard", difficulty: "困难", tileCount: 72, maxLayer: 4, description: "5层嵌套，槽位管理成为主要压力。" },
  { key: "nightmare", difficulty: "噩梦", tileCount: 90, maxLayer: 5, description: "6层嵌套，深牌与干扰牌明显增加。" },
  { key: "hell", difficulty: "地狱", tileCount: 108, maxLayer: 6, description: "7层嵌套，最大牌量与最深主牌区。" },
];

const STANDARD_YANG_LEVELS: YangLevelPreset[] = YANG_DIFFICULTIES.flatMap((difficulty) =>
  YANG_LAYOUTS.map((layout) => ({
    id: `${difficulty.key}-${layout.id}`,
    name: `${difficulty.difficulty}·${layout.name}`,
    subtitle: `${difficulty.tileCount}张 / ${difficulty.maxLayer + 1}层嵌套`,
    description: `${difficulty.description}${layout.description}`,
    difficulty: difficulty.difficulty,
    tileCount: difficulty.tileCount,
    maxLayer: difficulty.maxLayer,
    layoutKinds: [layout.id],
  })),
);

export const YANG_DIFFICULTY_PRESETS: YangLevelPreset[] = YANG_DIFFICULTIES.map((difficulty) => ({
  id: difficulty.key,
  name: difficulty.difficulty,
  subtitle: `${difficulty.maxLayer + 1}层 / 随机堆型`,
  description: `${difficulty.description}每局随机使用城堡、金字塔、双塔或回廊。`,
  difficulty: difficulty.difficulty,
  tileCount: difficulty.tileCount,
  maxLayer: difficulty.maxLayer,
  layoutKinds: YANG_LAYOUTS.map((layout) => layout.id),
}));

export const YANG_LEVEL_PRESETS: YangLevelPreset[] = [
  ...YANG_DIFFICULTY_PRESETS,
  {
    id: "endless",
    name: "无尽模式",
    subtitle: "随机难度 / 随机预设",
    description: "从5档难度与4种堆型中递进随机，通关后继续下一关。",
    difficulty: "无尽",
    tileCount: 36,
    maxLayer: 2,
    layoutKinds: YANG_LAYOUTS.map((layout) => layout.id),
    endless: true,
  },
];

export const YANG_TEST_LEVEL_PRESET: YangLevelPreset = {
  id: "test-triple",
  name: "测试小局",
  subtitle: "5张",
  description: "用于自动化测试的遮挡和三消局面。",
  difficulty: "简单",
  tileCount: 6,
  maxLayer: 1,
  layoutKinds: ["pyramid"],
};

function endlessRoundLevel(round: number): YangLevelPreset {
  const difficultyIndex = Math.min(YANG_DIFFICULTIES.length - 1, Math.floor((round - 1) / YANG_LAYOUTS.length));
  const layoutIndex = (round - 1) % YANG_LAYOUTS.length;
  const preset = STANDARD_YANG_LEVELS[difficultyIndex * YANG_LAYOUTS.length + layoutIndex];
  return {
    ...preset,
    id: "endless",
    name: `无尽·${preset.name}`,
    endless: true,
  };
}

export function resolveYangLevel(level: YangLevelPreset, seed = 1, round = 1): YangResolvedLevel {
  const base = level.endless ? endlessRoundLevel(round) : level;
  const layoutKind = base.layoutKinds[Math.abs(Math.trunc(seed + round * 17)) % base.layoutKinds.length] ?? "pyramid";
  return {
    ...base,
    layoutKind,
    round,
  };
}

export function getYangLevelPreset(levelId: string | undefined): YangLevelPreset {
  if (levelId === YANG_TEST_LEVEL_PRESET.id || levelId === "triple") {
    return YANG_TEST_LEVEL_PRESET;
  }
  const legacyLevelIds: Record<string, string> = {
    "easy-1": "easy",
    "easy-2": "easy",
    "easy-3": "easy",
    "easy-castle": "easy",
    "easy-pyramid": "easy",
    "easy-twin-towers": "easy",
    "easy-corridor": "easy",
    "normal-1": "normal",
    "normal-2": "normal",
    "normal-3": "normal",
    "normal-castle": "normal",
    "normal-pyramid": "normal",
    "normal-twin-towers": "normal",
    "normal-corridor": "normal",
    "hard-1": "hard",
    "hard-2": "nightmare",
    "hard-3": "hell",
    "hard-castle": "hard",
    "hard-pyramid": "hard",
    "hard-twin-towers": "hard",
    "hard-corridor": "hard",
    "nightmare-castle": "nightmare",
    "nightmare-pyramid": "nightmare",
    "nightmare-twin-towers": "nightmare",
    "nightmare-corridor": "nightmare",
    "hell-castle": "hell",
    "hell-pyramid": "hell",
    "hell-twin-towers": "hell",
    "hell-corridor": "hell",
  };
  const normalizedId = levelId ? legacyLevelIds[levelId] ?? levelId : undefined;
  return YANG_LEVEL_PRESETS.find((level) => level.id === normalizedId) ?? YANG_LEVEL_PRESETS[0];
}

export function getNextYangLevelPreset(currentLevelId: string): YangLevelPreset {
  const currentIndex = YANG_LEVEL_PRESETS.findIndex((level) => level.id === currentLevelId);
  if (currentIndex < 0 || currentIndex >= YANG_LEVEL_PRESETS.length - 1) {
    return YANG_LEVEL_PRESETS[YANG_LEVEL_PRESETS.length - 1];
  }
  return YANG_LEVEL_PRESETS[currentIndex + 1];
}
