import type { YangGameState } from "./engine";

const STORAGE_KEY = "mahjong-yangyang-save-v1";
const BEST_TIMES_KEY = "mahjong-yangyang-best-times-v1";

export type YangBestTimes = Record<string, number>;

type SavedYangGame = {
  version: 1;
  savedAt: number;
  state: YangGameState;
};

function isSavedYangGameState(value: unknown): value is YangGameState {
  const state = value as Partial<YangGameState> | undefined;
  return Boolean(
    state &&
      Array.isArray(state.tiles) &&
      state.tiles.every((tile) => tile?.zone === "main" || tile?.zone === "support-left" || tile?.zone === "support-right") &&
      Array.isArray(state.slots) &&
      typeof state.moves === "number" &&
      (state.status === "playing" || state.status === "won" || state.status === "failed"),
  );
}

export function loadSavedYangGame(): YangGameState | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    const saved = JSON.parse(raw) as SavedYangGame;
    if (saved.version !== 1 || !isSavedYangGameState(saved.state)) return undefined;

    return {
      ...saved.state,
      hintIds: saved.state.hintIds ?? [],
      seed: saved.state.seed ?? Date.now(),
      shuffleCount: saved.state.shuffleCount ?? 0,
      history: saved.state.history ?? [],
    };
  } catch {
    return undefined;
  }
}

export function saveYangGame(state: YangGameState): void {
  const saved: SavedYangGame = {
    version: 1,
    savedAt: Date.now(),
    state,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function clearSavedYangGame(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function loadYangBestTimes(): YangBestTimes {
  try {
    const raw = window.localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0),
    ) as YangBestTimes;
  } catch {
    return {};
  }
}

export function saveYangBestTime(levelId: string, seconds: number): YangBestTimes {
  const current = loadYangBestTimes();
  const previous = current[levelId];
  if (previous && previous <= seconds) {
    return current;
  }

  const next = {
    ...current,
    [levelId]: seconds,
  };
  window.localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(next));
  return next;
}
