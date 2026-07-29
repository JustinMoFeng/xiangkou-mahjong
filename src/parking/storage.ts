import type { ParkingGameState } from "./engine";
import { createLineLevel, getParkingLevelPreset } from "./levels";

const BEST_TIMES_KEY = "line-clear-best-times-v1";
const SAVE_KEY = "line-clear-save-v4";

export type ParkingBestTimes = Record<string, number>;

export function loadParkingBestTimes(): ParkingBestTimes {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0),
    ) as ParkingBestTimes;
  } catch {
    return {};
  }
}

export function saveParkingBestTime(levelId: string, seconds: number): ParkingBestTimes {
  const current = loadParkingBestTimes();
  const previous = current[levelId];
  if (previous !== undefined && previous <= seconds) {
    return current;
  }

  const next = { ...current, [levelId]: seconds };
  localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(next));
  return next;
}

export function loadParkingGame(): ParkingGameState | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<ParkingGameState>;
    if (!isSavedParkingGameState(parsed)) {
      localStorage.removeItem(SAVE_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return undefined;
  }
}

export function saveParkingGame(state: ParkingGameState): void {
  if (state.status !== "playing") {
    localStorage.removeItem(SAVE_KEY);
    return;
  }
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearParkingGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

function isSavedParkingGameState(value: Partial<ParkingGameState> | undefined): value is ParkingGameState {
  if (typeof value?.levelId !== "string") {
    return false;
  }

  const seed = typeof value.seed === "number" ? value.seed : undefined;
  if (seed === undefined || !Number.isFinite(seed)) {
    return false;
  }

  const preset = getParkingLevelPreset(value.levelId);
  const level = createLineLevel(preset, seed, value.endlessRound ?? 1);

  return (
    value?.status === "playing" &&
    typeof value.levelName === "string" &&
    typeof value.seed === "number" &&
    typeof value.rows === "number" &&
    typeof value.columns === "number" &&
    typeof value.hintsRemaining === "number" &&
    Array.isArray(value.hintIds) &&
    level.id === value.levelId &&
    level.rows === value.rows &&
    level.columns === value.columns &&
    (!level.cells || (Array.isArray(value.cells) && value.cells.length === level.cells.length)) &&
    Array.isArray(value.lines) &&
    value.lines.length === level.lines.length &&
    value.lines.every(
      (line) =>
        typeof line.id === "string" &&
        Array.isArray(line.points) &&
        line.points.every((point) => typeof point.row === "number" && typeof point.col === "number"),
    )
  );
}
