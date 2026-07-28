export type LineDirection = "up" | "right" | "down" | "left";

export type LinePoint = {
  row: number;
  col: number;
};

export type LineConfig = {
  id: string;
  label: string;
  points: LinePoint[];
  direction: LineDirection;
  color: "jade" | "gold" | "red" | "blue" | "purple" | "stone";
};

export type LineLayoutKind = "square" | "diamond" | "ring" | "cross" | "stairs";

export type LineDifficulty = "简单" | "进阶" | "困难" | "专家" | "大师" | "无尽";

export type LineLevel = {
  id: string;
  name: string;
  rows: number;
  columns: number;
  lines: LineConfig[];
  cells?: LinePoint[];
  presetId?: string;
  seed?: number;
  difficulty?: LineDifficulty;
  shapeName?: string;
  gridSize?: number;
  layoutKind?: LineLayoutKind;
  endless?: boolean;
  endlessRound?: number;
};

export type LineLevelPreset = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: LineDifficulty;
  gridSize: number;
  baseSeed: number;
  targetLineCount: number;
  lineCountJitter: number;
  initialOpenRatio: number;
  turnChance: [number, number];
  layoutKinds: LineLayoutKind[];
  endless?: boolean;
};

const LINE_COLORS: LineConfig["color"][] = ["jade", "gold", "red", "blue", "purple", "stone"];
const LINE_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const LINE_LAYOUTS: Record<LineLayoutKind, { name: string; description: string }> = {
  square: { name: "方阵", description: "完整方阵，路线密度均匀。" },
  diamond: { name: "菱形", description: "四角收束，边缘出口更多。" },
  ring: { name: "回字形", description: "中部镂空，内外双向抽线。" },
  cross: { name: "十字", description: "横竖主干交错，中心拥挤。" },
  stairs: { name: "阶梯", description: "左右错层，转折更自然。" },
};

const DIRECTION_DELTAS: Record<LineDirection, { row: number; col: number }> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

function lineLabel(index: number): string {
  let label = "";
  let cursor = index;

  do {
    label = LINE_LABELS[cursor % LINE_LABELS.length] + label;
    cursor = Math.floor(cursor / LINE_LABELS.length) - 1;
  } while (cursor >= 0);

  return label;
}

export function randomLineSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

function normalizeSeed(seed: number): number {
  const normalized = Math.trunc(Math.abs(seed)) % 2147483647;
  return normalized <= 0 ? 1 : normalized;
}

function mixSeed(seed: number): number {
  let value = normalizeSeed(seed) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value % 2147483646) + 1;
}

function createSeededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function pointKey(point: LinePoint): string {
  return `${point.row}:${point.col}`;
}

function inBounds(point: LinePoint, rows: number, columns: number): boolean {
  return point.row >= 0 && point.row < rows && point.col >= 0 && point.col < columns;
}

function step(point: LinePoint, direction: LineDirection, multiplier = 1): LinePoint {
  const delta = DIRECTION_DELTAS[direction];
  return {
    row: point.row + delta.row * multiplier,
    col: point.col + delta.col * multiplier,
  };
}

function oppositeDirection(direction: LineDirection): LineDirection {
  if (direction === "up") return "down";
  if (direction === "right") return "left";
  if (direction === "down") return "up";
  return "right";
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function rectangularCells(rows: number, columns: number): LinePoint[] {
  const cells: LinePoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      cells.push({ row, col });
    }
  }
  return cells;
}

function createShapeCells({ layoutKind, size }: { layoutKind: LineLayoutKind; size: number }): LinePoint[] {
  const center = (size - 1) / 2;
  const cells: LinePoint[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const distanceRow = Math.abs(row - center);
      const distanceCol = Math.abs(col - center);
      let inside = true;

      if (layoutKind === "diamond") {
        inside = distanceRow + distanceCol <= center + 0.5;
      } else if (layoutKind === "ring") {
        const hole = Math.max(2, Math.floor(size / 4));
        inside = distanceRow > hole || distanceCol > hole;
      } else if (layoutKind === "cross") {
        const arm = Math.max(2, Math.floor(size / 6));
        const centerMass = distanceRow + distanceCol <= Math.max(4, Math.floor(size / 3));
        inside = distanceRow <= arm || distanceCol <= arm || centerMass;
      } else if (layoutKind === "stairs") {
        const band = Math.max(5, Math.round(size * 0.68));
        const shift = Math.floor(row / 2);
        const start = Math.max(0, Math.min(size - band, shift));
        inside = col >= start && col < start + band;
      }

      if (inside) {
        cells.push({ row, col });
      }
    }
  }

  return cells.length > 0 ? cells : rectangularCells(size, size);
}

function isAssigned(point: LinePoint, assigned: Set<string>): boolean {
  return assigned.has(pointKey(point));
}

function isPlayable(point: LinePoint, playable: Set<string>): boolean {
  return playable.has(pointKey(point));
}

function isAvailable(point: LinePoint, rows: number, columns: number, playable: Set<string>, assigned: Set<string>, local: Set<string>): boolean {
  return inBounds(point, rows, columns) && isPlayable(point, playable) && !isAssigned(point, assigned) && !local.has(pointKey(point));
}

function hasClearRayToExit(
  point: LinePoint,
  direction: LineDirection,
  rows: number,
  columns: number,
  playable: Set<string>,
  assigned: Set<string>,
): boolean {
  let cursor = step(point, direction);
  while (inBounds(cursor, rows, columns) && isPlayable(cursor, playable)) {
    if (!isAssigned(cursor, assigned)) return false;
    cursor = step(cursor, direction);
  }
  return true;
}

type CandidateHead = {
  point: LinePoint;
  directions: LineDirection[];
};

type CandidatePick = {
  point: LinePoint;
  direction: LineDirection;
  exitBlockers: number;
};

function getCandidateHeads(rows: number, columns: number, cells: LinePoint[], playable: Set<string>, assigned: Set<string>): CandidateHead[] {
  const candidates: CandidateHead[] = [];

  for (const point of cells) {
    if (isAssigned(point, assigned)) continue;

    const directions = (Object.keys(DIRECTION_DELTAS) as LineDirection[]).filter((direction) =>
      hasClearRayToExit(point, direction, rows, columns, playable, assigned),
    );

    if (directions.length > 0) {
      candidates.push({ point, directions });
    }
  }

  return candidates;
}

function exitBlockerCount(point: LinePoint, direction: LineDirection, rows: number, columns: number, playable: Set<string>, assigned: Set<string>): number {
  let cursor = step(point, direction);
  let blockers = 0;

  while (inBounds(cursor, rows, columns) && isPlayable(cursor, playable)) {
    if (isAssigned(cursor, assigned)) {
      blockers += 1;
    }
    cursor = step(cursor, direction);
  }

  return blockers;
}

function chooseCandidate(
  candidates: CandidateHead[],
  rows: number,
  columns: number,
  playable: Set<string>,
  assigned: Set<string>,
  next: () => number,
  preferBlockedExit: boolean,
): CandidatePick {
  const combinations = candidates.flatMap((candidate) =>
    candidate.directions.map((direction) => ({
      point: candidate.point,
      direction,
      exitBlockers: exitBlockerCount(candidate.point, direction, rows, columns, playable, assigned),
    })),
  );
  const growable = combinations.filter(({ point, direction }) => {
    const bodyCell = step(point, oppositeDirection(direction));
    return inBounds(bodyCell, rows, columns) && isPlayable(bodyCell, playable) && !isAssigned(bodyCell, assigned);
  });
  const pool = growable.length > 0 ? growable : combinations;
  const blockedPool = preferBlockedExit ? pool.filter((candidate) => candidate.exitBlockers > 0) : [];
  const targetPool = blockedPool.length > 0 ? blockedPool : pool;
  const scored = targetPool.map((candidate) => ({
    ...candidate,
    score:
      (preferBlockedExit ? Math.min(candidate.exitBlockers, 8) * 1.6 : candidate.exitBlockers > 0 ? 0.25 : 0) +
      next() * 0.9,
  }));

  return scored.reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
}

function chooseLengthGoal(remainingCells: number, remainingLines: number, boardSize: number, next: () => number): number {
  if (remainingCells <= 2 || remainingLines <= 1) return remainingCells;

  const ideal = Math.max(3, remainingCells / remainingLines);
  const maxLength = Math.max(2, Math.min(remainingCells, Math.round(Math.max(ideal * 3.4, boardSize * 0.75))));
  const roll = next();
  let target: number;

  if (roll < 0.18) {
    target = 2 + Math.floor(next() * Math.max(2, Math.min(5, ideal)));
  } else if (roll < 0.7) {
    target = Math.round(ideal * (0.75 + next() * 0.9));
  } else {
    target = Math.round(ideal * (1.7 + next() * 1.9) + next() * boardSize * 0.18);
  }

  return Math.max(2, Math.min(maxLength, target));
}

function movementDirection(from: LinePoint, to: LinePoint): LineDirection | undefined {
  if (to.row < from.row) return "up";
  if (to.col > from.col) return "right";
  if (to.row > from.row) return "down";
  if (to.col < from.col) return "left";
  return undefined;
}

function onwardAvailableCount(
  point: LinePoint,
  rows: number,
  columns: number,
  playable: Set<string>,
  assigned: Set<string>,
  local: Set<string>,
): number {
  return (Object.keys(DIRECTION_DELTAS) as LineDirection[]).filter((direction) =>
    isAvailable(step(point, direction), rows, columns, playable, assigned, local),
  ).length;
}

function buildPath({
  head,
  direction,
  lengthGoal,
  rows,
  columns,
  playable,
  assigned,
  next,
  turnChance,
}: {
  head: LinePoint;
  direction: LineDirection;
  lengthGoal: number;
  rows: number;
  columns: number;
  playable: Set<string>;
  assigned: Set<string>;
  next: () => number;
  turnChance: number;
}): LinePoint[] {
  const local = new Set<string>([pointKey(head)]);
  const path: LinePoint[] = [head];
  const firstBodyCell = step(head, oppositeDirection(direction));

  if (path.length < lengthGoal && isAvailable(firstBodyCell, rows, columns, playable, assigned, local)) {
    path.push(firstBodyCell);
    local.add(pointKey(firstBodyCell));
  }

  while (path.length < lengthGoal) {
    const current = path[path.length - 1];
    const previous = path[path.length - 2];
    const previousMove = previous ? movementDirection(previous, current) : undefined;
    const shouldTurn = next() < turnChance;
    const neighbors = shuffle(Object.keys(DIRECTION_DELTAS) as LineDirection[], next)
      .map((candidateDirection) => ({ direction: candidateDirection, point: step(current, candidateDirection) }))
      .filter(({ point }) => isAvailable(point, rows, columns, playable, assigned, local));

    if (neighbors.length === 0) break;

    const chosen = neighbors
      .map((neighbor) => {
        const degree = onwardAvailableCount(neighbor.point, rows, columns, playable, assigned, local);
        const continueBonus = previousMove && neighbor.direction === previousMove ? 0.8 : 0;
        const turnBonus = shouldTurn && previousMove && neighbor.direction !== previousMove ? 0.45 : 0;
        const edgePenalty =
          neighbor.point.row === 0 || neighbor.point.col === 0 || neighbor.point.row === rows - 1 || neighbor.point.col === columns - 1
            ? -0.18
            : 0;
        return {
          ...neighbor,
          score: degree * 1.15 + continueBonus + turnBonus + edgePenalty + next() * 0.45,
        };
      })
      .reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
    path.push(chosen.point);
    local.add(pointKey(chosen.point));
  }

  return path;
}

type LineBuildAttempt = {
  head: LinePoint;
  direction: LineDirection;
  exitBlockers: number;
  points: LinePoint[];
  targetLength: number;
};

function remainingFragmentPenaltyAfter({
  cells,
  playable,
  assigned,
  points,
}: {
  cells: LinePoint[];
  playable: Set<string>;
  assigned: Set<string>;
  points: LinePoint[];
}): number {
  const removed = new Set<string>(assigned);
  for (const point of points) {
    removed.add(pointKey(point));
  }

  const visited = new Set<string>();
  let penalty = 0;
  for (const point of cells) {
    const key = pointKey(point);
    if (removed.has(key) || visited.has(key)) continue;

    const queue: LinePoint[] = [point];
    visited.add(key);
    let size = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      size += 1;

      for (const direction of Object.keys(DIRECTION_DELTAS) as LineDirection[]) {
        const neighbor = step(current, direction);
        const neighborKey = pointKey(neighbor);
        if (!isPlayable(neighbor, playable) || removed.has(neighborKey) || visited.has(neighborKey)) continue;
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }

    if (size === 1) {
      penalty += 18;
    } else if (size === 2) {
      penalty += 5;
    } else if (size === 3) {
      penalty += 1.4;
    }
  }

  return penalty;
}

function attemptBuildPath({
  candidates,
  targetLength,
  cells,
  preferBlockedExit,
  rows,
  columns,
  playable,
  assigned,
  next,
  turnChance,
}: {
  candidates: CandidateHead[];
  targetLength: number;
  cells: LinePoint[];
  preferBlockedExit: boolean;
  rows: number;
  columns: number;
  playable: Set<string>;
  assigned: Set<string>;
  next: () => number;
  turnChance: number;
}): LineBuildAttempt {
  const attemptCount = Math.min(72, Math.max(18, candidates.length));
  let best: LineBuildAttempt | undefined;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const { point: head, direction, exitBlockers } = chooseCandidate(candidates, rows, columns, playable, assigned, next, preferBlockedExit);
    const points = buildPath({
      head,
      direction,
      lengthGoal: targetLength,
      rows,
      columns,
      playable,
      assigned,
      next,
      turnChance,
    });
    const candidate = { head, direction, exitBlockers, points, targetLength };
    const fragmentPenalty = remainingFragmentPenaltyAfter({ cells, playable, assigned, points });
    const shortPenalty = points.length === 1 ? 9 : points.length === 2 ? 1.2 : 0;
    const lengthReward = Math.min(points.length, targetLength) + Math.min(points.length, targetLength * 1.5) * 0.18;
    const dependencyScore = preferBlockedExit ? (exitBlockers > 0 ? Math.min(exitBlockers, 8) * 1.15 : -8) : 0;
    const candidateScore = lengthReward + dependencyScore - Math.abs(targetLength - points.length) * 0.16 - fragmentPenalty - shortPenalty;

    if (!best || candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }

    if (points.length >= targetLength && fragmentPenalty === 0) {
      break;
    }
  }

  return best!;
}

function makePeelLevel({
  preset,
  seed,
  targetLineCount,
  turnChance,
  layoutKind,
  endlessRound = 1,
}: {
  preset: LineLevelPreset;
  seed: number;
  targetLineCount: number;
  turnChance: number;
  layoutKind: LineLayoutKind;
  endlessRound?: number;
}): LineLevel {
  const next = createSeededRandom(seed);
  const size = preset.gridSize;
  const cells = createShapeCells({ layoutKind, size });
  const playable = new Set(cells.map(pointKey));
  const assigned = new Set<string>();
  const lines: LineConfig[] = [];
  const totalCells = cells.length;
  const openHeadBudget = Math.max(2, Math.round(targetLineCount * preset.initialOpenRatio));
  let openHeadCount = 0;
  let guard = 0;

  while (assigned.size < totalCells && guard < totalCells * 4) {
    guard += 1;
    const candidates = getCandidateHeads(size, size, cells, playable, assigned);
    if (candidates.length === 0) {
      throw new Error(`Cannot generate line level ${preset.id}: no peelable head candidates remain.`);
    }

    const remainingCells = totalCells - assigned.size;
    const remainingLines = Math.max(1, targetLineCount - lines.length);
    const { direction, exitBlockers, points } = attemptBuildPath({
      candidates,
      targetLength: chooseLengthGoal(remainingCells, remainingLines, size, next),
      cells,
      preferBlockedExit: openHeadCount >= openHeadBudget,
      rows: size,
      columns: size,
      playable,
      assigned,
      next,
      turnChance,
    });

    if (exitBlockers === 0) {
      openHeadCount += 1;
    }

    for (const point of points) {
      assigned.add(pointKey(point));
    }

    const label = lineLabel(lines.length);
    lines.push({
      id: label.toLowerCase(),
      label,
      points,
      direction,
      color: LINE_COLORS[lines.length % LINE_COLORS.length],
    });
  }

  if (assigned.size !== totalCells) {
    throw new Error(`Cannot generate line level ${preset.id}: expected ${totalCells} cells, generated ${assigned.size}.`);
  }

  const layout = LINE_LAYOUTS[layoutKind];
  return {
    id: preset.id,
    name: preset.endless ? `无尽线阵` : preset.name,
    rows: size,
    columns: size,
    cells,
    lines,
    presetId: preset.id,
    seed: normalizeSeed(seed),
    difficulty: preset.difficulty,
    shapeName: layout.name,
    gridSize: preset.gridSize,
    layoutKind,
    endless: preset.endless,
    endlessRound: preset.endless ? endlessRound : undefined,
  };
}

const BASE_LAYOUTS: LineLayoutKind[] = ["square", "diamond", "ring", "cross", "stairs"];

export const LINE_LEVEL_PRESETS: LineLevelPreset[] = [
  {
    id: "easy",
    name: "简单",
    subtitle: "10 x 10",
    description: "小点阵，适合熟悉抽线节奏。",
    difficulty: "简单",
    gridSize: 10,
    baseSeed: 1701,
    targetLineCount: 18,
    lineCountJitter: 4,
    initialOpenRatio: 0.45,
    turnChance: [0.44, 0.62],
    layoutKinds: ["square", "diamond", "ring"],
  },
  {
    id: "advanced",
    name: "进阶",
    subtitle: "14 x 14",
    description: "中等点阵，随机方阵、菱形、回字和十字。",
    difficulty: "进阶",
    gridSize: 14,
    baseSeed: 2603,
    targetLineCount: 34,
    lineCountJitter: 7,
    initialOpenRatio: 0.36,
    turnChance: [0.5, 0.72],
    layoutKinds: ["square", "diamond", "ring", "cross"],
  },
  {
    id: "hard",
    name: "困难",
    subtitle: "18 x 18",
    description: "大点阵，加入阶梯形和更多转折。",
    difficulty: "困难",
    gridSize: 18,
    baseSeed: 4103,
    targetLineCount: 54,
    lineCountJitter: 10,
    initialOpenRatio: 0.3,
    turnChance: [0.56, 0.78],
    layoutKinds: BASE_LAYOUTS,
  },
  {
    id: "expert",
    name: "专家",
    subtitle: "22 x 22",
    description: "高密度点阵，需要规划外层抽线顺序。",
    difficulty: "专家",
    gridSize: 22,
    baseSeed: 5907,
    targetLineCount: 78,
    lineCountJitter: 14,
    initialOpenRatio: 0.24,
    turnChance: [0.62, 0.84],
    layoutKinds: BASE_LAYOUTS,
  },
  {
    id: "master",
    name: "大师",
    subtitle: "30 x 30",
    description: "最大点阵，线条会自动保持可读宽度。",
    difficulty: "大师",
    gridSize: 30,
    baseSeed: 7309,
    targetLineCount: 112,
    lineCountJitter: 20,
    initialOpenRatio: 0.19,
    turnChance: [0.66, 0.9],
    layoutKinds: BASE_LAYOUTS,
  },
  {
    id: "endless",
    name: "无尽",
    subtitle: "逐盘递进",
    description: "从 10 x 10 起逐步递进到 30 x 30，通关后继续下一盘。",
    difficulty: "无尽",
    gridSize: 10,
    baseSeed: 9103,
    targetLineCount: 20,
    lineCountJitter: 8,
    initialOpenRatio: 0.32,
    turnChance: [0.5, 0.86],
    layoutKinds: BASE_LAYOUTS,
    endless: true,
  },
];

const ENDLESS_ORDER = LINE_LEVEL_PRESETS.filter((preset) => !preset.endless);

function resolveEndlessPreset(base: LineLevelPreset, round: number): LineLevelPreset {
  if (!base.endless) return base;
  const difficulty = ENDLESS_ORDER[Math.min(ENDLESS_ORDER.length - 1, Math.floor((round - 1) / 2))] ?? ENDLESS_ORDER[0];
  return {
    ...difficulty,
    id: base.id,
    name: base.name,
    difficulty: "无尽",
    baseSeed: base.baseSeed + round * 101,
    endless: true,
  };
}

export function getParkingLevelPreset(id: string | undefined): LineLevelPreset {
  return LINE_LEVEL_PRESETS.find((preset) => preset.id === id) ?? LINE_LEVEL_PRESETS[0];
}

export function getNextParkingLevelPreset(id: string): LineLevelPreset {
  const index = LINE_LEVEL_PRESETS.findIndex((preset) => preset.id === id);
  return LINE_LEVEL_PRESETS[(index + 1) % LINE_LEVEL_PRESETS.length];
}

export function createLineLevel(
  presetOrId: LineLevelPreset | string | undefined = LINE_LEVEL_PRESETS[0],
  seed = randomLineSeed(),
  endlessRound = 1,
): LineLevel {
  const selectedPreset = typeof presetOrId === "string" || presetOrId === undefined ? getParkingLevelPreset(presetOrId) : presetOrId;
  const preset = resolveEndlessPreset(selectedPreset, endlessRound);
  const normalizedSeed = normalizeSeed(seed);
  const random = createSeededRandom(mixSeed(normalizedSeed + 7919 + endlessRound * 131));
  const layoutKind = preset.layoutKinds[Math.floor(random() * preset.layoutKinds.length)] ?? "square";
  const jitterSpan = preset.lineCountJitter * 2 + 1;
  const lineCountOffset = Math.floor(random() * jitterSpan) - preset.lineCountJitter;
  const targetLineCount = Math.max(12, preset.targetLineCount + lineCountOffset);
  const [minTurnChance, maxTurnChance] = preset.turnChance;
  const turnChance = minTurnChance + random() * (maxTurnChance - minTurnChance);

  return makePeelLevel({ preset, seed: normalizedSeed, targetLineCount, turnChance, layoutKind, endlessRound });
}

export const LINE_LEVELS: LineLevel[] = LINE_LEVEL_PRESETS.map((preset) => createLineLevel(preset, preset.baseSeed, 1));

export function getParkingLevel(id: string | undefined): LineLevel {
  const preset = getParkingLevelPreset(id);
  return createLineLevel(preset, preset.baseSeed, 1);
}

export function getNextParkingLevel(id: string): LineLevel {
  const preset = getNextParkingLevelPreset(id);
  return createLineLevel(preset, randomLineSeed(), 1);
}
