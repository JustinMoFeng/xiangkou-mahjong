import { normalizePlayerNames } from "./engine";
import type { GameState, PlayerNames } from "./types";

const STORAGE_KEY = "xiangkou-mahjong-save-v1";
const PROFILE_KEY = "xiangkou-mahjong-profile-v1";

export type SavedGame = {
  version: 1;
  savedAt: number;
  state: GameState;
};

export type TableProfile = {
  version: 1;
  names: PlayerNames;
};

export function loadTableProfile(): TableProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) {
      return { version: 1, names: normalizePlayerNames() };
    }

    const profile = JSON.parse(raw) as TableProfile;
    if (profile.version !== 1) {
      return { version: 1, names: normalizePlayerNames() };
    }

    return {
      version: 1,
      names: normalizePlayerNames(profile.names),
    };
  } catch {
    return { version: 1, names: normalizePlayerNames() };
  }
}

export function saveTableProfile(names: readonly string[]): TableProfile {
  const profile: TableProfile = {
    version: 1,
    names: normalizePlayerNames(names),
  };
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function loadSavedGame(): GameState | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;

    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version !== 1 || !saved.state?.players?.length) return undefined;

    saved.state.roundNumber ??= 1;
    const profile = loadTableProfile();
    saved.state.players.forEach((player) => {
      player.name = player.name?.trim() || profile.names[player.seat];
    });
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
