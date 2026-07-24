const BEST_TIMES_KEY = "mahjong-link-match-best-times-v1";

export type LinkBestTimes = Record<string, number>;

export function loadLinkBestTimes(): LinkBestTimes {
  try {
    const raw = window.localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0),
    ) as LinkBestTimes;
  } catch {
    return {};
  }
}

export function saveLinkBestTime(levelId: string, seconds: number): LinkBestTimes {
  const current = loadLinkBestTimes();
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
