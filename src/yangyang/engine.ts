import { shuffleWithSeed, type CasualTileCode } from "../casual/tiles";
import {
  createYangLayoutPoints,
  getYangLevelPreset,
  resolveYangLevel,
  type YangLayoutKind,
  type YangLevelPreset,
  type YangZone,
} from "./levels";

export const YANG_SLOT_CAPACITY = 7;

export type YangTile = {
  id: string;
  code: CasualTileCode;
  x: number;
  y: number;
  layer: number;
  zone: YangZone;
  removed: boolean;
};

export type YangSlotTile = {
  tileId: string;
  code: CasualTileCode;
};

export type YangStatus = "playing" | "won" | "failed";

export type YangSnapshot = {
  tiles: YangTile[];
  slots: YangSlotTile[];
  moves: number;
  status: YangStatus;
};

export type YangGameState = YangSnapshot & {
  startedAt: number;
  endedAt?: number;
  hintIds: string[];
  seed: number;
  shuffleCount: number;
  history: YangSnapshot[];
  levelId: string;
  levelName: string;
  difficulty: string;
  layoutKind: YangLayoutKind;
  tileCount: number;
  maxLayer: number;
  endless: boolean;
  endlessRound: number;
  clearPlan: number[][];
};

const levelCodes: CasualTileCode[] = [
  "m1",
  "m1",
  "m1",
  "m2",
  "m2",
  "m2",
  "m3",
  "m3",
  "m3",
  "m4",
  "m4",
  "m4",
  "m5",
  "m5",
  "m5",
  "p1",
  "p1",
  "p1",
  "p2",
  "p2",
  "p2",
  "p3",
  "p3",
  "p3",
  "p4",
  "p4",
  "p4",
  "p5",
  "p5",
  "p5",
  "s1",
  "s1",
  "s1",
  "s2",
  "s2",
  "s2",
  "s3",
  "s3",
  "s3",
  "east",
  "east",
  "east",
  "red",
  "red",
  "red",
  "green",
  "green",
  "green",
  "white",
  "white",
  "white",
  "south",
  "south",
  "south",
];

function snapshot(state: YangGameState): YangSnapshot {
  return {
    tiles: state.tiles.map((tile) => ({ ...tile })),
    slots: state.slots.map((slot) => ({ ...slot })),
    moves: state.moves,
    status: state.status,
  };
}

function intersects(first: YangTile, second: YangTile): boolean {
  if (first.zone !== second.zone) {
    return false;
  }
  const horizontal = Math.abs(first.x - second.x) < 6;
  const vertical = Math.abs(first.y - second.y) < 6;
  return horizontal && vertical;
}

export function isYangTileBlocked(tiles: readonly YangTile[], tileId: string): boolean {
  const tile = tiles.find((item) => item.id === tileId);
  if (!tile || tile.removed) {
    return true;
  }

  return tiles.some((other) => !other.removed && other.layer > tile.layer && intersects(tile, other));
}

export function getClickableYangTiles(tiles: readonly YangTile[]): YangTile[] {
  return tiles.filter((tile) => !tile.removed && !isYangTileBlocked(tiles, tile.id));
}

function buildYangClearPlan(points: Array<{ x: number; y: number; layer: number; zone: YangZone }>): number[][] {
  const tiles: YangTile[] = points.map((point, index) => ({
    id: String(index),
    code: "m1",
    x: point.x,
    y: point.y,
    layer: point.layer,
    zone: point.zone,
    removed: false,
  }));
  const groups: number[][] = [];

  while (tiles.some((tile) => !tile.removed)) {
    const clickable = getClickableYangTiles(tiles)
      .map((tile) => Number(tile.id))
      .sort((first, second) => points[second].layer - points[first].layer || first - second);
    if (clickable.length < 3) {
      throw new Error("Yangyang layout must expose at least three removable tiles at every clear step.");
    }
    const group = clickable.slice(0, 3);
    groups.push(group);
    for (const index of group) {
      tiles[index] = { ...tiles[index], removed: true };
    }
  }

  return groups;
}

function createSolvableCodes(seed: number, clearPlan: number[][], tileCount: number): CasualTileCode[] {
  const uniqueCodes = Array.from(new Set(levelCodes));
  const groupCodes = shuffleWithSeed(uniqueCodes, seed);
  const codes = Array<CasualTileCode>(tileCount);

  for (const [groupIndex, group] of clearPlan.entries()) {
    const code = groupCodes[groupIndex % groupCodes.length];
    for (const tileIndex of group) {
      codes[tileIndex] = code;
    }
  }

  return codes;
}

export function getYangOpeningClearPlan(level: YangLevelPreset = getYangLevelPreset(undefined), seed = 1, round = 1): number[][] {
  const resolved = resolveYangLevel(level, seed, round);
  return buildYangClearPlan(createYangLayoutPoints(resolved)).map((group) => [...group]);
}

function clearTriples(slots: readonly YangSlotTile[]): YangSlotTile[] {
  const counts = new Map<CasualTileCode, number>();
  for (const slot of slots) {
    counts.set(slot.code, (counts.get(slot.code) ?? 0) + 1);
  }

  const clearedCode = [...counts.entries()].find(([, count]) => count >= 3)?.[0];
  if (!clearedCode) {
    return [...slots];
  }

  return slots.filter((slot) => slot.code !== clearedCode);
}

function nextStatus(tiles: readonly YangTile[], slots: readonly YangSlotTile[]): YangStatus {
  if (tiles.every((tile) => tile.removed) && slots.length === 0) {
    return "won";
  }
  if (slots.length >= YANG_SLOT_CAPACITY) {
    return "failed";
  }
  return "playing";
}

export function createYangGame(seed = Date.now(), startedAt = Date.now()): YangGameState {
  return createYangGameForLevel(seed, startedAt, getYangLevelPreset(undefined));
}

export function createYangGameForLevel(
  seed = Date.now(),
  startedAt = Date.now(),
  level: YangLevelPreset = getYangLevelPreset(undefined),
  endlessRound = 1,
): YangGameState {
  const resolvedLevel = resolveYangLevel(level, seed, endlessRound);
  const layoutPoints = createYangLayoutPoints(resolvedLevel);
  const clearPlan = buildYangClearPlan(layoutPoints);
  const solvableCodes = createSolvableCodes(seed, clearPlan, layoutPoints.length);
  return {
    tiles: layoutPoints.map((point, index) => ({
      id: `yang-${index}-${point.layer}`,
      code: solvableCodes[index],
      x: point.x,
      y: point.y,
      layer: point.layer,
      zone: point.zone,
      removed: false,
    })),
    slots: [],
    moves: 0,
    status: "playing",
    startedAt,
    hintIds: [],
    seed,
    shuffleCount: 0,
    history: [],
    levelId: level.id,
    levelName: resolvedLevel.name,
    difficulty: resolvedLevel.difficulty,
    layoutKind: resolvedLevel.layoutKind,
    tileCount: layoutPoints.length,
    maxLayer: resolvedLevel.maxLayer,
    endless: Boolean(level.endless),
    endlessRound,
    clearPlan,
  };
}

export function selectYangTile(state: YangGameState, tileId: string, now = Date.now()): YangGameState {
  if (state.status !== "playing" || isYangTileBlocked(state.tiles, tileId)) {
    return state;
  }

  const tile = state.tiles.find((item) => item.id === tileId);
  if (!tile || state.slots.length >= YANG_SLOT_CAPACITY) {
    return state;
  }

  const tiles = state.tiles.map((item) => (item.id === tileId ? { ...item, removed: true } : item));
  const slots = clearTriples([...state.slots, { tileId, code: tile.code }]);
  const status = nextStatus(tiles, slots);

  return {
    ...state,
    tiles,
    slots,
    moves: state.moves + 1,
    status,
    endedAt: status === "playing" ? state.endedAt : now,
    hintIds: [],
    history: [...state.history, snapshot(state)],
  };
}

export function undoYangMove(state: YangGameState): YangGameState {
  const previous = state.history[state.history.length - 1];
  if (!previous) {
    return state;
  }

  return {
    ...state,
    ...previous,
    endedAt: undefined,
    hintIds: [],
    history: state.history.slice(0, -1),
  };
}

export function revealYangHint(state: YangGameState): YangGameState {
  if (state.status !== "playing") {
    return state;
  }

  const slotsByCode = new Map<CasualTileCode, number>();
  for (const slot of state.slots) {
    slotsByCode.set(slot.code, (slotsByCode.get(slot.code) ?? 0) + 1);
  }

  const clickable = getClickableYangTiles(state.tiles);
  const nearClear = clickable.find((tile) => (slotsByCode.get(tile.code) ?? 0) >= 2);
  if (nearClear) {
    return { ...state, hintIds: [nearClear.id] };
  }

  const byCode = new Map<CasualTileCode, YangTile[]>();
  for (const tile of clickable) {
    byCode.set(tile.code, [...(byCode.get(tile.code) ?? []), tile]);
  }

  const pair = [...byCode.values()].find((items) => items.length >= 2);
  return { ...state, hintIds: pair ? pair.slice(0, 2).map((tile) => tile.id) : clickable.slice(0, 1).map((tile) => tile.id) };
}

export function shuffleYangTiles(state: YangGameState, seed = Date.now()): YangGameState {
  if (state.status !== "playing") {
    return state;
  }

  const remaining = state.tiles.filter((tile) => !tile.removed);
  const shuffledCodes = shuffleWithSeed(
    remaining.map((tile) => tile.code),
    seed,
  );
  let remainingIndex = 0;

  return {
    ...state,
    tiles: state.tiles.map((tile) => {
      if (tile.removed) {
        return tile;
      }
      const code = shuffledCodes[remainingIndex];
      remainingIndex += 1;
      return { ...tile, code };
    }),
    hintIds: [],
    shuffleCount: state.shuffleCount + 1,
  };
}

export function createYangStateForTest(tiles: YangTile[], slots: YangSlotTile[] = []): YangGameState {
  return {
    tiles,
    slots,
    moves: 0,
    status: nextStatus(tiles, slots),
    startedAt: 0,
    hintIds: [],
    seed: 1,
    shuffleCount: 0,
    history: [],
    levelId: "test",
    levelName: "测试局",
    difficulty: "简单",
    layoutKind: "pyramid",
    tileCount: tiles.length,
    maxLayer: Math.max(0, ...tiles.map((tile) => tile.layer)),
    endless: false,
    endlessRound: 1,
    clearPlan: [],
  };
}

export function createYangTripleScenario(startedAt = Date.now()): YangGameState {
  return {
    ...createYangStateForTest([
      yangScenarioTile("triple-a", "m1", 6, 3, 0),
      yangScenarioTile("triple-b", "m1", 12, 3, 0),
      yangScenarioTile("triple-c", "m1", 18, 3, 0),
      yangScenarioTile("blocked-low", "p1", 12, 12, 0),
      yangScenarioTile("blocking-up", "p2", 15, 15, 1),
    ]),
    startedAt,
  };
}

function yangScenarioTile(
  id: string,
  code: CasualTileCode,
  x: number,
  y: number,
  layer: number,
): YangTile {
  return {
    id,
    code,
    x,
    y,
    layer,
    zone: "main",
    removed: false,
  };
}
