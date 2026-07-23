import type { GameState } from "./types";

const STORAGE_KEY = "xiangkou-sichuan-save-v1";

export type SavedGame = {
  version: 1;
  savedAt: number;
  state: GameState;
};

export function loadSavedGame(): GameState | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version !== 1 || !saved.state?.players?.length) return undefined;

    saved.state.roundNumber ??= 1;
    return saved.state;
  } catch {
    return undefined;
  }
}

export function saveGame(state: GameState): void {
  const saved: SavedGame = {
    version: 1,
    savedAt: Date.now(),
    state,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function clearSavedGame(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
