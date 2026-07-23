import type { Meld, ScoreDetail, SuitPrefix, Tile, TileCode, WinKind } from "./types";
import { tileRankNumber, tileSortValue, tileSuitPrefix } from "./tiles";

type Counts = Map<TileCode, number>;

export const BASE_POINTS = 2;
export const MAX_FAN = 8;

const JIANG_RANKS = new Set([2, 5, 8]);

export function checkWin(concealed: Tile[], melds: Meld[]): boolean {
  if (melds.length === 0 && concealed.length === 14 && isSevenPairs(concealed)) {
    return true;
  }
  return canFormStandard(concealed);
}

export function isTenpai(hand: Tile[], melds: Meld[], missingSuit?: SuitPrefix): boolean {
  if (hand.some((tile) => tile.suit === missingSuit)) {
    return false;
  }

  for (const code of candidateCodes(missingSuit)) {
    const probe = [...hand, makeProbeTile(code)];
    if (checkWin(probe, melds)) {
      return true;
    }
  }

  return false;
}

export type ScoreContext = {
  kind: WinKind;
  isGangFlower?: boolean;
  isGangPao?: boolean;
  isRobKong?: boolean;
  isLastTile?: boolean;
  isHeavenly?: boolean;
  isEarthly?: boolean;
};

export type ScoreOutput = {
  title: string;
  fan: number;
  multiplier: number;
  details: ScoreDetail[];
};

export function scoreWin(concealed: Tile[], melds: Meld[], context: ScoreContext): ScoreOutput {
  const details: ScoreDetail[] = [];
  const allCounts = countAll(concealed, melds);
  const sevenPairs = melds.length === 0 && concealed.length === 14 && isSevenPairs(concealed);

  if (sevenPairs) {
    details.push({ name: "七对", fan: 2 });
  } else if (isAllTriplets(concealed)) {
    details.push({ name: "对对胡", fan: 1 });
    if (isAllJiang(concealed, melds)) {
      details.push({ name: "将对", fan: 2 });
    }
    if (melds.length === 4) {
      details.push({ name: "金钩钓", fan: 1 });
    }
  } else {
    details.push({ name: "平胡", fan: 0 });
  }

  if (isPureOneSuit(allCounts)) {
    details.push({ name: "清一色", fan: 2 });
  }

  const roots = countRoots(allCounts, sevenPairs);
  for (let index = 0; index < roots; index += 1) {
    details.push({ name: "根", fan: 1 });
  }

  if (context.kind === "self-draw") {
    details.push({ name: "自摸", fan: 1 });
  }
  if (context.isGangFlower) {
    details.push({ name: "杠上开花", fan: 1 });
  }
  if (context.isGangPao) {
    details.push({ name: "杠上炮", fan: 1 });
  }
  if (context.isRobKong) {
    details.push({ name: "抢杠胡", fan: 1 });
  }
  if (context.isLastTile) {
    details.push({ name: context.kind === "self-draw" ? "海底捞月" : "海底炮", fan: 1 });
  }
  if (context.isHeavenly) {
    details.push({ name: "天胡", fan: 6 });
  }
  if (context.isEarthly) {
    details.push({ name: "地胡", fan: 6 });
  }

  const rawFan = details.reduce((total, detail) => total + detail.fan, 0);
  const fan = Math.min(rawFan, MAX_FAN);
  const multiplier = 2 ** fan;
  const named = details.filter((detail) => detail.name !== "平胡" || details.length === 1);
  const title = named.map((detail) => detail.name).join(" + ") || "平胡";

  return { title, fan, multiplier, details };
}

export function maxTenpaiValue(hand: Tile[], melds: Meld[], missingSuit?: SuitPrefix): number {
  let best = 0;

  for (const code of candidateCodes(missingSuit)) {
    const winningTile = makeProbeTile(code);
    const probe = [...hand, winningTile];
    if (!checkWin(probe, melds)) {
      continue;
    }
    const score = scoreWin(probe, melds, { kind: "discard" });
    best = Math.max(best, score.multiplier);
  }

  return best;
}

function canFormStandard(tiles: Tile[]): boolean {
  if (tiles.length % 3 !== 2) {
    return false;
  }

  const counts = countTileCodes(tiles);
  const codes = [...counts.keys()];

  for (const pair of codes) {
    if ((counts.get(pair) ?? 0) < 2) {
      continue;
    }
    const next = new Map(counts);
    next.set(pair, (next.get(pair) ?? 0) - 2);
    if (formsMelds(next)) {
      return true;
    }
  }

  return false;
}

function formsMelds(counts: Counts): boolean {
  const first = firstRemainingCode(counts);
  if (!first) {
    return true;
  }

  const available = counts.get(first) ?? 0;

  if (available >= 3) {
    const next = new Map(counts);
    next.set(first, available - 3);
    if (formsMelds(next)) {
      return true;
    }
  }

  const second = neighborCode(first, 1);
  const third = neighborCode(first, 2);
  if (second && third && (counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
    const next = new Map(counts);
    next.set(first, available - 1);
    next.set(second, (next.get(second) ?? 0) - 1);
    next.set(third, (next.get(third) ?? 0) - 1);
    if (formsMelds(next)) {
      return true;
    }
  }

  return false;
}

export function isSevenPairs(tiles: Tile[]): boolean {
  if (tiles.length !== 14) {
    return false;
  }
  const counts = countTileCodes(tiles);
  for (const value of counts.values()) {
    if (value % 2 !== 0) {
      return false;
    }
  }
  return true;
}

function isAllTriplets(concealed: Tile[]): boolean {
  if (concealed.length % 3 !== 2) {
    return false;
  }
  const counts = countTileCodes(concealed);
  const codes = [...counts.keys()];

  for (const pair of codes) {
    if ((counts.get(pair) ?? 0) < 2) {
      continue;
    }
    const next = new Map(counts);
    next.set(pair, (next.get(pair) ?? 0) - 2);
    if ([...next.values()].every((value) => value % 3 === 0)) {
      return true;
    }
  }

  return false;
}

function isAllJiang(concealed: Tile[], melds: Meld[]): boolean {
  const meldsJiang = melds.every((meld) => JIANG_RANKS.has(tileRankNumber(meld.code)));
  if (!meldsJiang) {
    return false;
  }
  return concealed.every((tile) => JIANG_RANKS.has(tile.rank));
}

function isPureOneSuit(counts: Counts): boolean {
  const suits = new Set<SuitPrefix>();
  for (const [code, value] of counts.entries()) {
    if (value > 0) {
      suits.add(tileSuitPrefix(code));
    }
  }
  return suits.size === 1;
}

function countRoots(counts: Counts, sevenPairs: boolean): number {
  let roots = 0;
  for (const value of counts.values()) {
    if (value === 4) {
      roots += 1;
    } else if (value === 8 && sevenPairs) {
      roots += 2;
    }
  }
  return roots;
}

function countAll(concealed: Tile[], melds: Meld[]): Counts {
  const counts = countTileCodes(concealed);
  for (const meld of melds) {
    counts.set(meld.code, (counts.get(meld.code) ?? 0) + meld.tiles.length);
  }
  return counts;
}

function countTileCodes(tiles: Tile[]): Counts {
  const counts: Counts = new Map();
  for (const tile of tiles) {
    counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  }
  return counts;
}

function firstRemainingCode(counts: Counts): TileCode | undefined {
  return [...counts.entries()]
    .filter(([, value]) => value > 0)
    .map(([code]) => code)
    .sort((a, b) => tileSortValue(a) - tileSortValue(b))[0];
}

function neighborCode(code: TileCode, offset: number): TileCode | undefined {
  const prefix = tileSuitPrefix(code);
  const rank = tileRankNumber(code);
  if (rank + offset > 9) {
    return undefined;
  }
  return `${prefix}${rank + offset}` as TileCode;
}

function candidateCodes(missingSuit?: SuitPrefix): TileCode[] {
  const codes: TileCode[] = [];
  for (const prefix of ["m", "p", "s"] as const) {
    if (prefix === missingSuit) {
      continue;
    }
    for (let rank = 1; rank <= 9; rank += 1) {
      codes.push(`${prefix}${rank}` as TileCode);
    }
  }
  return codes;
}

function makeProbeTile(code: TileCode): Tile {
  return {
    id: `probe-${code}`,
    code,
    suit: tileSuitPrefix(code),
    rank: tileRankNumber(code),
    label: code,
    shortLabel: code,
  };
}
