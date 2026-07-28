import { getParkingLevel, type LineConfig, type LineDirection, type LineLevel, type LinePoint } from "./levels";

export type ParkingLine = LineConfig & {
  exited: boolean;
};

export type ParkingGameState = {
  levelId: string;
  levelName: string;
  seed: number;
  difficulty?: string;
  shapeName?: string;
  gridSize?: number;
  endless?: boolean;
  endlessRound?: number;
  rows: number;
  columns: number;
  cells?: LinePoint[];
  lines: ParkingLine[];
  selectedId?: string;
  blockedId?: string;
  hintIds: string[];
  hintsRemaining: number;
  moves: number;
  exitedCount: number;
  status: "playing" | "won";
  startedAt: number;
  endedAt?: number;
};

const directionDelta: Record<LineDirection, { row: number; col: number }> = {
  up: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
};

export function createParkingGame(
  levelOrId: LineLevel | string = getParkingLevel(undefined),
  startedAt = Date.now(),
  carry: Partial<Pick<ParkingGameState, "hintsRemaining">> = {},
): ParkingGameState {
  const level = typeof levelOrId === "string" ? getParkingLevel(levelOrId) : levelOrId;
  return {
    levelId: level.id,
    levelName: level.name,
    seed: level.seed ?? startedAt,
    difficulty: level.difficulty,
    shapeName: level.shapeName,
    gridSize: level.gridSize,
    endless: level.endless,
    endlessRound: level.endlessRound,
    rows: level.rows,
    columns: level.columns,
    cells: level.cells?.map((point) => ({ ...point })),
    lines: level.lines.map((line) => ({ ...line, points: line.points.map((point) => ({ ...point })), exited: false })),
    hintIds: [],
    hintsRemaining: carry.hintsRemaining ?? 3,
    moves: 0,
    exitedCount: 0,
    status: "playing",
    startedAt,
  };
}

export function lineCells(line: ParkingLine): LinePoint[] {
  return line.exited ? [] : line.points.map((point) => ({ ...point }));
}

export function cellOwner(state: ParkingGameState, row: number, col: number): ParkingLine | undefined {
  return (state.lines ?? []).find((line) => lineCells(line).some((cell) => cell.row === row && cell.col === col));
}

function occupiedOwnerMap(state: ParkingGameState): Map<string, string> {
  const occupied = new Map<string, string>();
  for (const line of state.lines ?? []) {
    if (line.exited) continue;
    for (const cell of line.points) {
      occupied.set(`${cell.row}:${cell.col}`, line.id);
    }
  }
  return occupied;
}

function playableCellSet(state: ParkingGameState): Set<string> | undefined {
  return state.cells ? new Set(state.cells.map((cell) => `${cell.row}:${cell.col}`)) : undefined;
}

function isPlayableCell(state: ParkingGameState, row: number, col: number, playable = playableCellSet(state)): boolean {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.columns) return false;
  if (!playable) return true;
  return playable.has(`${row}:${col}`);
}

export function headCell(line: ParkingLine): LinePoint {
  return line.points[0];
}

export function exitPath(state: ParkingGameState, line: ParkingLine, playable = playableCellSet(state)): LinePoint[] {
  if (line.exited) return [];
  const delta = directionDelta[line.direction];
  const path: LinePoint[] = [];
  let cursor = headCell(line);

  while (true) {
    cursor = { row: cursor.row + delta.row, col: cursor.col + delta.col };
    if (!isPlayableCell(state, cursor.row, cursor.col, playable)) {
      return path;
    }
    path.push(cursor);
  }
}

export function canLineExit(state: ParkingGameState, lineId: string): boolean {
  const line = (state.lines ?? []).find((item) => item.id === lineId);
  if (!line || line.exited) return false;
  const occupied = occupiedOwnerMap(state);
  const playable = playableCellSet(state);
  return exitPath(state, line, playable).every((cell) => {
    const ownerId = occupied.get(`${cell.row}:${cell.col}`);
    return ownerId === undefined || ownerId === line.id;
  });
}

export function clearLine(state: ParkingGameState, lineId: string, now = Date.now()): ParkingGameState {
  const line = (state.lines ?? []).find((item) => item.id === lineId);
  if (!line || state.status !== "playing") return state;

  if (state.selectedId === lineId && state.blockedId === lineId) {
    return state;
  }

  if (!canLineExit(state, lineId)) {
    return {
      ...state,
      selectedId: lineId,
      blockedId: lineId,
    };
  }

  const lines = state.lines.map((item) => (item.id === lineId ? { ...item, exited: true } : item));
  const exitedCount = lines.filter((item) => item.exited).length;
  const won = exitedCount === lines.length;

  return {
    ...state,
    lines,
    selectedId: undefined,
    blockedId: undefined,
    hintIds: state.hintIds.filter((id) => id !== lineId),
    moves: state.moves + 1,
    exitedCount,
    status: won ? "won" : "playing",
    endedAt: won ? now : undefined,
  };
}

export function getExitReadyLineIds(state: ParkingGameState): string[] {
  const occupied = occupiedOwnerMap(state);
  const playable = playableCellSet(state);
  return (state.lines ?? [])
    .filter((line) => {
      if (line.exited) return false;
      return exitPath(state, line, playable).every((cell) => {
        const ownerId = occupied.get(`${cell.row}:${cell.col}`);
        return ownerId === undefined || ownerId === line.id;
      });
    })
    .map((line) => line.id);
}

export function revealParkingHint(state: ParkingGameState): ParkingGameState {
  if (state.status !== "playing" || state.hintsRemaining <= 0) return state;

  const readyIds = getExitReadyLineIds(state);
  const hintId = readyIds.find((id) => !state.hintIds.includes(id)) ?? readyIds[0];
  if (!hintId) return state;

  return {
    ...state,
    selectedId: undefined,
    blockedId: undefined,
    hintIds: [hintId],
    hintsRemaining: state.hintsRemaining - 1,
  };
}

export function exitTravelCells(state: ParkingGameState, line: ParkingLine): number {
  if (line.exited) return 0;
  const front = headCell(line);
  if (line.direction === "left") return front.col + 1;
  if (line.direction === "right") return state.columns - front.col;
  if (line.direction === "up") return front.row + 1;
  return state.rows - front.row;
}
