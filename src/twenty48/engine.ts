export const TWENTY48_SIZE = 4;
export const TWENTY48_TARGET = 2048;
export const TWENTY48_HISTORY_LIMIT = 8;

export type Twenty48Direction = "up" | "right" | "down" | "left";
export type Twenty48Status = "playing" | "won" | "lost";

export type Twenty48Snapshot = {
  board: number[];
  score: number;
  moves: number;
  status: Twenty48Status;
  randomState: number;
  wonAtLeastOnce: boolean;
  endedAt?: number;
};

export type Twenty48GameState = Twenty48Snapshot & {
  seed: number;
  startedAt: number;
  history: Twenty48Snapshot[];
};

export type Twenty48MoveTile = {
  fromIndex: number;
  toIndex: number;
  value: number;
  merged: boolean;
};

export type Twenty48MovePreview = {
  board: number[];
  scoreGain: number;
  moved: boolean;
  tiles: Twenty48MoveTile[];
  mergedIndexes: number[];
};

const RANDOM_MODULUS = 2147483647;
const RANDOM_MULTIPLIER = 16807;

function normalizeSeed(seed = Date.now()): number {
  let state = Math.trunc(seed) % RANDOM_MODULUS;
  if (state <= 0) {
    state += RANDOM_MODULUS - 1;
  }
  return state;
}

function nextRandom(randomState: number): { randomState: number; value: number } {
  const nextState = (randomState * RANDOM_MULTIPLIER) % RANDOM_MODULUS;
  return {
    randomState: nextState,
    value: (nextState - 1) / (RANDOM_MODULUS - 1),
  };
}

function emptyBoard(): number[] {
  return Array(TWENTY48_SIZE * TWENTY48_SIZE).fill(0) as number[];
}

function cellIndex(row: number, col: number): number {
  return row * TWENTY48_SIZE + col;
}

function writeLine(board: number[], direction: Twenty48Direction, lineIndex: number, line: readonly number[]): void {
  for (let offset = 0; offset < TWENTY48_SIZE; offset += 1) {
    const value = line[offset];
    if (direction === "left") {
      board[cellIndex(lineIndex, offset)] = value;
    } else if (direction === "right") {
      board[cellIndex(lineIndex, TWENTY48_SIZE - 1 - offset)] = value;
    } else if (direction === "up") {
      board[cellIndex(offset, lineIndex)] = value;
    } else {
      board[cellIndex(TWENTY48_SIZE - 1 - offset, lineIndex)] = value;
    }
  }
}

function lineIndexToBoardIndex(direction: Twenty48Direction, lineIndex: number, offset: number): number {
  if (direction === "left") {
    return cellIndex(lineIndex, offset);
  }
  if (direction === "right") {
    return cellIndex(lineIndex, TWENTY48_SIZE - 1 - offset);
  }
  if (direction === "up") {
    return cellIndex(offset, lineIndex);
  }
  return cellIndex(TWENTY48_SIZE - 1 - offset, lineIndex);
}

function snapshot(state: Twenty48GameState): Twenty48Snapshot {
  return {
    board: [...state.board],
    score: state.score,
    moves: state.moves,
    status: state.status,
    randomState: state.randomState,
    wonAtLeastOnce: state.wonAtLeastOnce,
    endedAt: state.endedAt,
  };
}

export function collapseTwenty48Line(line: readonly number[]): { line: number[]; scoreGain: number; moved: boolean } {
  const values = line.filter((value) => value > 0);
  const collapsed: number[] = [];
  let scoreGain = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const merged = values[index] * 2;
      collapsed.push(merged);
      scoreGain += merged;
      index += 1;
    } else {
      collapsed.push(values[index]);
    }
  }

  while (collapsed.length < TWENTY48_SIZE) {
    collapsed.push(0);
  }

  return {
    line: collapsed,
    scoreGain,
    moved: collapsed.some((value, index) => value !== line[index]),
  };
}

function collapseTwenty48Cells(
  cells: Array<{ value: number; index: number }>,
): { line: number[]; scoreGain: number; moved: boolean; tiles: Twenty48MoveTile[]; mergedOffsets: number[] } {
  const values = cells.filter((cell) => cell.value > 0);
  const collapsed: number[] = [];
  const tiles: Twenty48MoveTile[] = [];
  const mergedOffsets: number[] = [];
  let scoreGain = 0;
  let writeOffset = 0;

  for (let readOffset = 0; readOffset < values.length; readOffset += 1) {
    const current = values[readOffset];
    const next = values[readOffset + 1];
    if (next && current.value === next.value) {
      const merged = current.value * 2;
      collapsed.push(merged);
      scoreGain += merged;
      mergedOffsets.push(writeOffset);
      tiles.push(
        { fromIndex: current.index, toIndex: writeOffset, value: current.value, merged: true },
        { fromIndex: next.index, toIndex: writeOffset, value: next.value, merged: true },
      );
      readOffset += 1;
    } else {
      collapsed.push(current.value);
      tiles.push({ fromIndex: current.index, toIndex: writeOffset, value: current.value, merged: false });
    }
    writeOffset += 1;
  }

  while (collapsed.length < TWENTY48_SIZE) {
    collapsed.push(0);
  }

  return {
    line: collapsed,
    scoreGain,
    moved: collapsed.some((value, index) => value !== cells[index].value),
    tiles,
    mergedOffsets,
  };
}

export function previewTwenty48Move(board: readonly number[], direction: Twenty48Direction): Twenty48MovePreview {
  const nextBoard = emptyBoard();
  const tiles: Twenty48MoveTile[] = [];
  const mergedIndexes: number[] = [];
  let moved = false;
  let scoreGain = 0;

  for (let lineIndex = 0; lineIndex < TWENTY48_SIZE; lineIndex += 1) {
    const cells = Array.from({ length: TWENTY48_SIZE }, (_, offset) => ({
      value: board[lineIndexToBoardIndex(direction, lineIndex, offset)],
      index: offset,
    }));
    const collapsed = collapseTwenty48Cells(cells);
    moved = moved || collapsed.moved;
    scoreGain += collapsed.scoreGain;
    writeLine(nextBoard, direction, lineIndex, collapsed.line);
    tiles.push(
      ...collapsed.tiles.map((tile) => ({
        ...tile,
        fromIndex: lineIndexToBoardIndex(direction, lineIndex, tile.fromIndex),
        toIndex: lineIndexToBoardIndex(direction, lineIndex, tile.toIndex),
      })),
    );
    mergedIndexes.push(...collapsed.mergedOffsets.map((offset) => lineIndexToBoardIndex(direction, lineIndex, offset)));
  }

  return {
    board: nextBoard,
    scoreGain,
    moved,
    tiles,
    mergedIndexes,
  };
}

export function canTwenty48Move(board: readonly number[]): boolean {
  if (board.some((value) => value === 0)) {
    return true;
  }

  for (let row = 0; row < TWENTY48_SIZE; row += 1) {
    for (let col = 0; col < TWENTY48_SIZE; col += 1) {
      const value = board[cellIndex(row, col)];
      if (col + 1 < TWENTY48_SIZE && board[cellIndex(row, col + 1)] === value) {
        return true;
      }
      if (row + 1 < TWENTY48_SIZE && board[cellIndex(row + 1, col)] === value) {
        return true;
      }
    }
  }

  return false;
}

export function highestTwenty48Tile(board: readonly number[]): number {
  return board.reduce((highest, value) => Math.max(highest, value), 0);
}

export function filledTwenty48Cells(board: readonly number[]): number {
  return board.filter((value) => value > 0).length;
}

function statusForBoard(board: readonly number[], wonAtLeastOnce: boolean): Twenty48Status {
  if (!wonAtLeastOnce && board.some((value) => value >= TWENTY48_TARGET)) {
    return "won";
  }
  if (!canTwenty48Move(board)) {
    return "lost";
  }
  return "playing";
}

function addRandomTile(board: readonly number[], randomState: number): { board: number[]; randomState: number } {
  const emptyIndexes = board.flatMap((value, index) => (value === 0 ? [index] : []));
  if (emptyIndexes.length === 0) {
    return { board: [...board], randomState };
  }

  const positionRandom = nextRandom(randomState);
  const valueRandom = nextRandom(positionRandom.randomState);
  const nextBoard = [...board];
  const tileIndex = emptyIndexes[Math.floor(positionRandom.value * emptyIndexes.length)];
  nextBoard[tileIndex] = valueRandom.value < 0.9 ? 2 : 4;

  return {
    board: nextBoard,
    randomState: valueRandom.randomState,
  };
}

export function createTwenty48Game(seed = Date.now(), startedAt = Date.now()): Twenty48GameState {
  const normalizedSeed = normalizeSeed(seed);
  const firstTile = addRandomTile(emptyBoard(), normalizedSeed);
  const secondTile = addRandomTile(firstTile.board, firstTile.randomState);

  return {
    board: secondTile.board,
    score: 0,
    moves: 0,
    status: "playing",
    seed: normalizedSeed,
    randomState: secondTile.randomState,
    startedAt,
    wonAtLeastOnce: false,
    history: [],
  };
}

export function moveTwenty48(
  state: Twenty48GameState,
  direction: Twenty48Direction,
  now = Date.now(),
): Twenty48GameState {
  if (state.status !== "playing") {
    return state;
  }

  const preview = previewTwenty48Move(state.board, direction);
  if (!preview.moved) {
    return state;
  }

  const withTile = addRandomTile(preview.board, state.randomState);
  const status = statusForBoard(withTile.board, state.wonAtLeastOnce);
  return {
    ...state,
    board: withTile.board,
    score: state.score + preview.scoreGain,
    moves: state.moves + 1,
    status,
    randomState: withTile.randomState,
    endedAt: status === "playing" ? undefined : now,
    history: [snapshot(state), ...state.history].slice(0, TWENTY48_HISTORY_LIMIT),
  };
}

export function undoTwenty48Move(state: Twenty48GameState): Twenty48GameState {
  const [previous, ...rest] = state.history;
  if (!previous) {
    return state;
  }

  return {
    ...state,
    ...previous,
    board: [...previous.board],
    history: rest,
  };
}

export function continueTwenty48Game(state: Twenty48GameState): Twenty48GameState {
  if (state.status !== "won") {
    return state;
  }

  return {
    ...state,
    status: canTwenty48Move(state.board) ? "playing" : "lost",
    wonAtLeastOnce: true,
    endedAt: undefined,
  };
}

export function createTwenty48StateForTest(
  board: readonly number[],
  overrides: Partial<Twenty48GameState> = {},
): Twenty48GameState {
  const seed = normalizeSeed(overrides.seed ?? 1);
  return {
    board: [...board],
    score: overrides.score ?? 0,
    moves: overrides.moves ?? 0,
    status: overrides.status ?? statusForBoard(board, overrides.wonAtLeastOnce ?? false),
    seed,
    randomState: normalizeSeed(overrides.randomState ?? seed),
    startedAt: overrides.startedAt ?? 0,
    endedAt: overrides.endedAt,
    wonAtLeastOnce: overrides.wonAtLeastOnce ?? false,
    history: overrides.history ?? [],
  };
}
