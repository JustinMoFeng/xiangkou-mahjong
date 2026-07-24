export type LinkCell = {
  row: number;
  col: number;
};

export type LinkLevelPreset = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: "入门" | "普通" | "进阶" | "困难" | "专家" | "无尽";
  columns: number;
  rows: number;
  tileKindCount: number;
  timeLimitSeconds: number;
  hintLimit: number;
  shuffleLimit: number;
  layoutKinds: LinkLayoutKind[];
  endless?: boolean;
};

export type LinkLayoutKind = "rectangle" | "courtyard" | "diamond" | "stairs" | "islands";

function rectangle(columns: number, rows: number): LinkCell[] {
  return Array.from({ length: rows }).flatMap((_, row) =>
    Array.from({ length: columns }).map((__, col) => ({ row, col })),
  );
}

function without(cells: LinkCell[], removed: ReadonlySet<string>): LinkCell[] {
  return cells.filter((cell) => !removed.has(`${cell.row}:${cell.col}`));
}

function centeredRows(columns: number, lengths: readonly number[], rowOffset = 0): LinkCell[] {
  return lengths.flatMap((length, row) => {
    const start = Math.floor((columns - length) / 2);
    return Array.from({ length }).map((_, index) => ({ row: row + rowOffset, col: start + index }));
  });
}

function stairRows(columns: number, lengths: readonly number[]): LinkCell[] {
  return lengths.flatMap((length, row) => {
    const offset = row % 2 === 0 ? 0 : 1;
    const start = Math.min(offset, Math.max(0, columns - length));
    return Array.from({ length }).map((_, index) => ({ row, col: start + index }));
  });
}

function courtyardCells(columns: number, rows: number): LinkCell[] {
  const holeWidth = columns >= 10 ? 4 : 2;
  const holeHeight = rows >= 10 ? 4 : 2;
  const startCol = Math.floor((columns - holeWidth) / 2);
  const startRow = Math.floor((rows - holeHeight) / 2);
  const removed = new Set<string>();
  for (let row = startRow; row < startRow + holeHeight; row += 1) {
    for (let col = startCol; col < startCol + holeWidth; col += 1) {
      removed.add(`${row}:${col}`);
    }
  }
  return without(rectangle(columns, rows), removed);
}

function diamondCells(columns: number, rows: number): LinkCell[] {
  const center = Math.floor(rows / 2);
  const lengths = Array.from({ length: rows }).map((_, row) => {
    const distance = Math.abs(row - center);
    const raw = columns - distance * 2;
    return Math.max(2, raw % 2 === 0 ? raw : raw - 1);
  });
  return centeredRows(columns, lengths);
}

function islandCells(columns: number, rows: number): LinkCell[] {
  const cells = rectangle(columns, rows);
  const bridgeRow = Math.floor(rows / 2);
  const splitLeft = Math.floor(columns / 2) - 1;
  const splitRight = splitLeft + 1;
  const removed = new Set<string>();
  for (let row = 1; row < rows - 1; row += 1) {
    if (row === bridgeRow || row === bridgeRow - 1) continue;
    removed.add(`${row}:${splitLeft}`);
    removed.add(`${row}:${splitRight}`);
  }
  return without(cells, removed);
}

function normalizeEven(cells: LinkCell[]): LinkCell[] {
  return cells.length % 2 === 0 ? cells : cells.slice(0, -1);
}

export function createLinkLevelCells(level: LinkLevelPreset, seed = 1): { cells: LinkCell[]; layoutKind: LinkLayoutKind } {
  const layoutKind = level.layoutKinds[Math.abs(Math.trunc(seed)) % level.layoutKinds.length] ?? "rectangle";
  const cells = (() => {
    if (layoutKind === "courtyard") return courtyardCells(level.columns, level.rows);
    if (layoutKind === "diamond") return diamondCells(level.columns, level.rows);
    if (layoutKind === "stairs") {
      const base = Array.from({ length: level.rows }).map((_, row) => {
        const growth = Math.floor(row / 2) * 2;
        return Math.min(level.columns, Math.max(4, level.columns - 4 + growth));
      });
      return stairRows(level.columns, base);
    }
    if (layoutKind === "islands") return islandCells(level.columns, level.rows);
    return rectangle(level.columns, level.rows);
  })();

  return {
    cells: normalizeEven(cells),
    layoutKind,
  };
}

export const LINK_LEVEL_PRESETS: LinkLevelPreset[] = [
  {
    id: "wall",
    name: "入门",
    subtitle: "8x6 / 48张",
    description: "6种牌面，矩形小盘，适合熟悉规则。",
    difficulty: "入门",
    columns: 8,
    rows: 6,
    tileKindCount: 6,
    timeLimitSeconds: 10 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["rectangle"],
  },
  {
    id: "courtyard",
    name: "普通",
    subtitle: "8x8 / 64张",
    description: "8种牌面，随机矩形或小镂空。",
    difficulty: "普通",
    columns: 8,
    rows: 8,
    tileKindCount: 8,
    timeLimitSeconds: 12 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["rectangle", "courtyard"],
  },
  {
    id: "diamond",
    name: "进阶",
    subtitle: "10x8 / 80张",
    description: "10种牌面，随机镂空、菱形或双区。",
    difficulty: "进阶",
    columns: 10,
    rows: 8,
    tileKindCount: 10,
    timeLimitSeconds: 16 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["rectangle", "courtyard", "diamond", "islands"],
  },
  {
    id: "stairs",
    name: "困难",
    subtitle: "10x10 / 100张",
    description: "10种牌面，随机阶梯、菱形和分区。",
    difficulty: "困难",
    columns: 10,
    rows: 10,
    tileKindCount: 10,
    timeLimitSeconds: 22 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["courtyard", "diamond", "stairs", "islands"],
  },
  {
    id: "expert",
    name: "专家",
    subtitle: "12x12 / 144张",
    description: "12种牌面，最大盘面内随机图案。",
    difficulty: "专家",
    columns: 12,
    rows: 12,
    tileKindCount: 12,
    timeLimitSeconds: 30 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["rectangle", "courtyard", "diamond", "stairs", "islands"],
  },
  {
    id: "endless",
    name: "无尽",
    subtitle: "12x12内循环",
    description: "在最大盘面内持续随机生成，通关后继续下一盘。",
    difficulty: "无尽",
    columns: 12,
    rows: 12,
    tileKindCount: 12,
    timeLimitSeconds: 30 * 60,
    hintLimit: 5,
    shuffleLimit: 3,
    layoutKinds: ["rectangle", "courtyard", "diamond", "stairs", "islands"],
    endless: true,
  },
];

export const LINK_TEST_LEVEL_PRESET: LinkLevelPreset = {
  id: "tiny-test",
  name: "测试小局",
  subtitle: "2x1",
  description: "用于自动化测试的隐藏小局。",
  difficulty: "入门",
  columns: 2,
  rows: 1,
  tileKindCount: 1,
  timeLimitSeconds: 60,
  hintLimit: 5,
  shuffleLimit: 3,
  layoutKinds: ["rectangle"],
};

export function getLinkLevelPreset(levelId: string | undefined): LinkLevelPreset {
  if (levelId === LINK_TEST_LEVEL_PRESET.id) {
    return LINK_TEST_LEVEL_PRESET;
  }
  return LINK_LEVEL_PRESETS.find((level) => level.id === levelId) ?? LINK_LEVEL_PRESETS[0];
}

export function getNextLinkLevelPreset(currentLevelId: string): LinkLevelPreset {
  if (currentLevelId === LINK_TEST_LEVEL_PRESET.id) {
    return LINK_LEVEL_PRESETS[1];
  }

  const currentIndex = LINK_LEVEL_PRESETS.findIndex((level) => level.id === currentLevelId);
  if (currentIndex < 0 || currentIndex >= LINK_LEVEL_PRESETS.length - 1) {
    return LINK_LEVEL_PRESETS[LINK_LEVEL_PRESETS.length - 1];
  }
  return LINK_LEVEL_PRESETS[currentIndex + 1];
}
