import { shuffleWithSeed, type CasualTileCode } from "../casual/tiles";

export const YANG_SLOT_CAPACITY = 7;

export type YangTile = {
  id: string;
  code: CasualTileCode;
  x: number;
  y: number;
  layer: number;
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
};

const layoutPoints: Array<{ x: number; y: number; layer: number }> = [
  { x: 2.0, y: 0.9, layer: 0 },
  { x: 3.0, y: 0.9, layer: 0 },
  { x: 4.0, y: 0.9, layer: 0 },
  { x: 5.0, y: 0.9, layer: 0 },
  { x: 2.0, y: 1.9, layer: 0 },
  { x: 3.0, y: 1.9, layer: 0 },
  { x: 4.0, y: 1.9, layer: 0 },
  { x: 5.0, y: 1.9, layer: 0 },
  { x: 2.0, y: 2.9, layer: 0 },
  { x: 3.0, y: 2.9, layer: 0 },
  { x: 4.0, y: 2.9, layer: 0 },
  { x: 5.0, y: 2.9, layer: 0 },
  { x: 2.0, y: 3.9, layer: 0 },
  { x: 3.0, y: 3.9, layer: 0 },
  { x: 4.0, y: 3.9, layer: 0 },
  { x: 5.0, y: 3.9, layer: 0 },

  { x: 1.15, y: 1.35, layer: 1 },
  { x: 2.15, y: 1.35, layer: 1 },
  { x: 3.15, y: 1.35, layer: 1 },
  { x: 4.15, y: 1.35, layer: 1 },
  { x: 5.15, y: 1.35, layer: 1 },
  { x: 6.15, y: 1.35, layer: 1 },
  { x: 1.15, y: 2.35, layer: 1 },
  { x: 2.15, y: 2.35, layer: 1 },
  { x: 3.15, y: 2.35, layer: 1 },
  { x: 4.15, y: 2.35, layer: 1 },
  { x: 5.15, y: 2.35, layer: 1 },
  { x: 6.15, y: 2.35, layer: 1 },
  { x: 1.15, y: 3.35, layer: 1 },
  { x: 2.15, y: 3.35, layer: 1 },
  { x: 3.15, y: 3.35, layer: 1 },
  { x: 4.15, y: 3.35, layer: 1 },
  { x: 5.15, y: 3.35, layer: 1 },
  { x: 6.15, y: 3.35, layer: 1 },

  { x: 2.45, y: 1.8, layer: 2 },
  { x: 3.45, y: 1.8, layer: 2 },
  { x: 4.45, y: 1.8, layer: 2 },
  { x: 2.45, y: 2.8, layer: 2 },
  { x: 3.45, y: 2.8, layer: 2 },
  { x: 4.45, y: 2.8, layer: 2 },
  { x: 2.95, y: 2.3, layer: 3 },
  { x: 3.95, y: 2.3, layer: 3 },
  { x: 3.45, y: 2.05, layer: 4 },
  { x: 3.45, y: 2.55, layer: 4 },
  { x: 3.45, y: 2.3, layer: 5 },
];

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
  const horizontal = Math.abs(first.x - second.x) < 0.86;
  const vertical = Math.abs(first.y - second.y) < 0.86;
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
  const shuffledCodes = shuffleWithSeed(levelCodes, seed);
  return {
    tiles: layoutPoints.map((point, index) => ({
      id: `yang-${index}-${point.layer}`,
      code: shuffledCodes[index],
      x: point.x,
      y: point.y,
      layer: point.layer,
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
  };
}

export function createYangTripleScenario(startedAt = Date.now()): YangGameState {
  return {
    ...createYangStateForTest([
      yangScenarioTile("triple-a", "m1", 0.6, 0.8, 0),
      yangScenarioTile("triple-b", "m1", 1.8, 0.8, 0),
      yangScenarioTile("triple-c", "m1", 3.0, 0.8, 0),
      yangScenarioTile("blocked-low", "p1", 2.0, 2.2, 0),
      yangScenarioTile("blocking-up", "p2", 2.1, 2.25, 1),
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
    removed: false,
  };
}
