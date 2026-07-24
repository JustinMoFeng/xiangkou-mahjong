import { CASUAL_TILE_CODES, shuffleWithSeed, type CasualTileCode } from "../casual/tiles";

export const LINK_COLUMNS = 8;
export const LINK_ROWS = 6;
export const LINK_PAIR_COUNT = (LINK_COLUMNS * LINK_ROWS) / 2;

export type LinkTile = {
  id: string;
  code: CasualTileCode;
  row: number;
  col: number;
  removed: boolean;
};

export type LinkPoint = {
  row: number;
  col: number;
};

export type LinkHint = {
  firstId: string;
  secondId: string;
  path: LinkPoint[];
};

export type LinkGameStatus = "playing" | "won";

export type LinkGameState = {
  tiles: LinkTile[];
  selectedId?: string;
  hintIds: string[];
  lastPath: LinkPoint[];
  moves: number;
  removedPairs: number;
  startedAt: number;
  endedAt?: number;
  status: LinkGameStatus;
  seed: number;
  shuffleCount: number;
};

type Direction = "up" | "right" | "down" | "left";

type QueueNode = {
  row: number;
  col: number;
  direction?: Direction;
  turns: number;
  path: LinkPoint[];
};

const directions: Array<{ direction: Direction; rowDelta: number; colDelta: number }> = [
  { direction: "up", rowDelta: -1, colDelta: 0 },
  { direction: "right", rowDelta: 0, colDelta: 1 },
  { direction: "down", rowDelta: 1, colDelta: 0 },
  { direction: "left", rowDelta: 0, colDelta: -1 },
];

function tileAt(tiles: readonly LinkTile[], row: number, col: number): LinkTile | undefined {
  return tiles.find((tile) => !tile.removed && tile.row === row && tile.col === col);
}

function isWalkable(
  tiles: readonly LinkTile[],
  point: LinkPoint,
  target: LinkPoint,
  rows: number,
  columns: number,
): boolean {
  if (point.row < -1 || point.row > rows || point.col < -1 || point.col > columns) {
    return false;
  }

  if (point.row === target.row && point.col === target.col) {
    return true;
  }

  if (point.row < 0 || point.row >= rows || point.col < 0 || point.col >= columns) {
    return true;
  }

  return tileAt(tiles, point.row, point.col) === undefined;
}

function compressPath(path: readonly LinkPoint[]): LinkPoint[] {
  if (path.length <= 2) {
    return [...path];
  }

  const compressed: LinkPoint[] = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    const sameRow = previous.row === current.row && current.row === next.row;
    const sameCol = previous.col === current.col && current.col === next.col;
    if (!sameRow && !sameCol) {
      compressed.push(current);
    }
  }
  compressed.push(path[path.length - 1]);
  return compressed;
}

export function findLinkPath(
  tiles: readonly LinkTile[],
  first: LinkTile,
  second: LinkTile,
  rows = LINK_ROWS,
  columns = LINK_COLUMNS,
): LinkPoint[] | undefined {
  if (first.id === second.id || first.removed || second.removed || first.code !== second.code) {
    return undefined;
  }

  const start: LinkPoint = { row: first.row, col: first.col };
  const target: LinkPoint = { row: second.row, col: second.col };
  const queue: QueueNode[] = [{ ...start, turns: 0, path: [start] }];
  const bestTurns = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.row},${current.col},${current.direction ?? "start"}`;
    const previousBest = bestTurns.get(key);
    if (previousBest !== undefined && previousBest <= current.turns) {
      continue;
    }
    bestTurns.set(key, current.turns);

    if (current.row === target.row && current.col === target.col) {
      return compressPath(current.path);
    }

    for (const option of directions) {
      const turns = current.direction && current.direction !== option.direction ? current.turns + 1 : current.turns;
      if (turns > 2) {
        continue;
      }

      const next = {
        row: current.row + option.rowDelta,
        col: current.col + option.colDelta,
      };
      if (!isWalkable(tiles, next, target, rows, columns)) {
        continue;
      }

      queue.push({
        ...next,
        direction: option.direction,
        turns,
        path: [...current.path, next],
      });
    }
  }

  return undefined;
}

export function findAnyLink(tiles: readonly LinkTile[]): LinkHint | undefined {
  const activeTiles = tiles.filter((tile) => !tile.removed);

  for (let firstIndex = 0; firstIndex < activeTiles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < activeTiles.length; secondIndex += 1) {
      const first = activeTiles[firstIndex];
      const second = activeTiles[secondIndex];
      if (first.code !== second.code) {
        continue;
      }

      const path = findLinkPath(tiles, first, second);
      if (path) {
        return { firstId: first.id, secondId: second.id, path };
      }
    }
  }

  return undefined;
}

function buildTiles(codes: readonly CasualTileCode[]): LinkTile[] {
  return codes.map((code, index) => ({
    id: `link-${index}-${code}`,
    code,
    row: Math.floor(index / LINK_COLUMNS),
    col: index % LINK_COLUMNS,
    removed: false,
  }));
}

function forceFirstAvailablePair(tiles: readonly LinkTile[]): LinkTile[] {
  const activeTiles = tiles.filter((tile) => !tile.removed);
  const byCode = new Map<CasualTileCode, LinkTile[]>();
  for (const tile of activeTiles) {
    byCode.set(tile.code, [...(byCode.get(tile.code) ?? []), tile]);
  }

  const sourcePair = [...byCode.values()].find((items) => items.length >= 2);
  if (!sourcePair) {
    return [...tiles];
  }

  for (let firstIndex = 0; firstIndex < activeTiles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < activeTiles.length; secondIndex += 1) {
      const first = activeTiles[firstIndex];
      const second = activeTiles[secondIndex];
      const trial = tiles.map((tile) => {
        if (tile.id === first.id || tile.id === second.id) {
          return { ...tile, code: sourcePair[0].code };
        }
        if (tile.id === sourcePair[0].id) {
          return { ...tile, code: first.code };
        }
        if (tile.id === sourcePair[1].id) {
          return { ...tile, code: second.code };
        }
        return tile;
      });

      const trialFirst = trial.find((tile) => tile.id === first.id);
      const trialSecond = trial.find((tile) => tile.id === second.id);
      if (trialFirst && trialSecond && findLinkPath(trial, trialFirst, trialSecond)) {
        return trial;
      }
    }
  }

  return [...tiles];
}

export function createLinkGame(seed = Date.now(), startedAt = Date.now()): LinkGameState {
  const pairCodes = CASUAL_TILE_CODES.slice(0, LINK_PAIR_COUNT).flatMap((code) => [code, code]);
  let tiles = buildTiles(shuffleWithSeed(pairCodes, seed));
  let attempt = 1;

  while (!findAnyLink(tiles) && attempt < 80) {
    tiles = buildTiles(shuffleWithSeed(pairCodes, seed + attempt * 97));
    attempt += 1;
  }
  if (!findAnyLink(tiles)) {
    tiles = forceFirstAvailablePair(tiles);
  }

  return {
    tiles,
    hintIds: [],
    lastPath: [],
    moves: 0,
    removedPairs: 0,
    startedAt,
    status: "playing",
    seed,
    shuffleCount: 0,
  };
}

function clearTransient(state: LinkGameState): LinkGameState {
  return {
    ...state,
    hintIds: [],
    lastPath: [],
  };
}

export function selectLinkTile(state: LinkGameState, tileId: string, now = Date.now()): LinkGameState {
  if (state.status !== "playing") {
    return state;
  }

  const tile = state.tiles.find((item) => item.id === tileId);
  if (!tile || tile.removed) {
    return state;
  }

  const base = clearTransient(state);
  if (!base.selectedId || base.selectedId === tileId) {
    return { ...base, selectedId: base.selectedId === tileId ? undefined : tileId };
  }

  const selected = base.tiles.find((item) => item.id === base.selectedId);
  if (!selected || selected.removed) {
    return { ...base, selectedId: tileId };
  }

  const path = findLinkPath(base.tiles, selected, tile);
  if (!path) {
    return { ...base, selectedId: tileId, moves: base.moves + 1 };
  }

  const removedPairs = base.removedPairs + 1;
  const status: LinkGameStatus = removedPairs >= LINK_PAIR_COUNT ? "won" : "playing";
  return {
    ...base,
    tiles: base.tiles.map((item) =>
      item.id === selected.id || item.id === tile.id
        ? {
            ...item,
            removed: true,
          }
        : item,
    ),
    selectedId: undefined,
    lastPath: path,
    moves: base.moves + 1,
    removedPairs,
    status,
    endedAt: status === "won" ? now : undefined,
  };
}

export function revealLinkHint(state: LinkGameState): LinkGameState {
  if (state.status !== "playing") {
    return state;
  }

  const hint = findAnyLink(state.tiles);
  if (!hint) {
    return { ...state, hintIds: [], lastPath: [] };
  }

  return {
    ...state,
    selectedId: undefined,
    hintIds: [hint.firstId, hint.secondId],
    lastPath: hint.path,
  };
}

export function shuffleRemainingLinkTiles(state: LinkGameState, seed = Date.now()): LinkGameState {
  if (state.status !== "playing") {
    return state;
  }

  const remaining = state.tiles.filter((tile) => !tile.removed);
  if (remaining.length <= 2) {
    return state;
  }

  const positions = remaining.map((tile) => ({ row: tile.row, col: tile.col }));
  const codes = remaining.map((tile) => tile.code);
  let shuffled = shuffleWithSeed(codes, seed);
  let nextTiles = state.tiles.map((tile) => {
    const remainingIndex = remaining.findIndex((item) => item.id === tile.id);
    if (remainingIndex < 0) {
      return tile;
    }

    return {
      ...tile,
      code: shuffled[remainingIndex],
      row: positions[remainingIndex].row,
      col: positions[remainingIndex].col,
    };
  });

  let attempt = 1;
  while (!findAnyLink(nextTiles) && attempt < 120) {
    shuffled = shuffleWithSeed(codes, seed + attempt * 131);
    nextTiles = state.tiles.map((tile) => {
      const remainingIndex = remaining.findIndex((item) => item.id === tile.id);
      if (remainingIndex < 0) {
        return tile;
      }

      return {
        ...tile,
        code: shuffled[remainingIndex],
        row: positions[remainingIndex].row,
        col: positions[remainingIndex].col,
      };
    });
    attempt += 1;
  }
  if (!findAnyLink(nextTiles)) {
    nextTiles = forceFirstAvailablePair(nextTiles);
  }

  return {
    ...state,
    tiles: nextTiles,
    selectedId: undefined,
    hintIds: [],
    lastPath: [],
    shuffleCount: state.shuffleCount + 1,
  };
}
