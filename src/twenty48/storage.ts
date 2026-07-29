import type { Twenty48GameState } from "./engine";

const BEST_SCORE_KEY = "twenty48-best-score-v1";
const SAVE_KEY = "twenty48-save-v1";

export function loadTwenty48BestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveTwenty48BestScore(score: number): number {
  const current = loadTwenty48BestScore();
  const next = Math.max(current, Number.isFinite(score) ? score : 0);
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(next));
  } catch {
    // Best score is optional; gameplay should continue if storage is unavailable.
  }
  return next;
}

export function loadTwenty48Game(): Twenty48GameState | undefined {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<Twenty48GameState>;
    if (!isSavedTwenty48GameState(parsed)) {
      window.localStorage.removeItem(SAVE_KEY);
      return undefined;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(SAVE_KEY);
    return undefined;
  }
}

export function saveTwenty48Game(state: Twenty48GameState): void {
  if (state.status !== "playing" || state.moves === 0) {
    window.localStorage.removeItem(SAVE_KEY);
    return;
  }

  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Saves are a convenience; losing storage should not break a turn.
  }
}

export function clearTwenty48Game(): void {
  window.localStorage.removeItem(SAVE_KEY);
}

function isSavedTwenty48GameState(value: Partial<Twenty48GameState> | undefined): value is Twenty48GameState {
  return (
    Array.isArray(value?.board) &&
    value.board.length === 16 &&
    value.board.every((cell) => Number.isInteger(cell) && cell >= 0) &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    typeof value.moves === "number" &&
    Number.isFinite(value.moves) &&
    value.moves >= 0 &&
    (value.status === "playing" || value.status === "won" || value.status === "lost") &&
    typeof value.seed === "number" &&
    Number.isFinite(value.seed) &&
    typeof value.randomState === "number" &&
    Number.isFinite(value.randomState) &&
    typeof value.startedAt === "number" &&
    Number.isFinite(value.startedAt) &&
    typeof value.wonAtLeastOnce === "boolean" &&
    Array.isArray(value.history)
  );
}
