import type { ScoreDetail, Tile, TileCode, WinKind, WinPattern } from "./types";
import {
  isHonorTile,
  isNumberTile,
  tileRankNumber,
  tileSortValue,
  tileSuitPrefix,
} from "./tiles";

type Counts = Map<TileCode, number>;

export type WinCheck = {
  canWin: boolean;
  pattern?: WinPattern;
};

export type ScoreInput = {
  tiles: Tile[];
  winningTile: Tile;
  kind: WinKind;
  pattern: WinPattern;
};

export type ScoreOutput = {
  title: string;
  multiplier: number;
  details: ScoreDetail[];
};

export function checkStandardWin(tiles: Tile[]): WinCheck {
  if (tiles.length % 3 !== 2) {
    return { canWin: false };
  }

  const counts = countTileCodes(tiles);
  const codes = [...counts.keys()].sort((a, b) => tileSortValue(a) - tileSortValue(b));

  for (const pair of codes) {
    if ((counts.get(pair) ?? 0) < 2) {
      continue;
    }

    const nextCounts = cloneCounts(counts);
    decrement(nextCounts, pair, 2);
    const melds = findMelds(nextCounts);

    if (melds) {
      return {
        canWin: true,
        pattern: {
          pair,
          melds,
        },
      };
    }
  }

  return { canWin: false };
}

export function scoreWinningHand(input: ScoreInput): ScoreOutput {
  const details: ScoreDetail[] = [{ name: "垃圾胡", multiplier: 1 }];

  if (input.kind === "self-draw") {
    details.push({ name: "自摸", multiplier: 1 });
  }

  if (isAllTriplets(input.pattern)) {
    details.push({ name: "碰碰胡", multiplier: 2 });
  }

  if (isPureOneSuit(input.tiles)) {
    details.push({ name: "清一色", multiplier: 4 });
  }

  const honorTriplets = countHonorTriplets(input.pattern);
  for (let index = 0; index < honorTriplets; index += 1) {
    details.push({ name: "字牌刻子", multiplier: 1 });
  }

  const multiplier = details.reduce((total, detail) => total + detail.multiplier, 0);
  const title = multiplier === 1 ? "垃圾胡" : details.map((detail) => detail.name).join(" + ");

  return {
    title,
    multiplier,
    details,
  };
}

export function canWinWithTile(hand: Tile[], tile: Tile): WinCheck {
  return checkStandardWin([...hand, tile]);
}

function countTileCodes(tiles: Tile[]): Counts {
  const counts: Counts = new Map();

  for (const tile of tiles) {
    counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  }

  return counts;
}

function findMelds(counts: Counts): TileCode[][] | undefined {
  const first = firstRemainingCode(counts);

  if (!first) {
    return [];
  }

  if ((counts.get(first) ?? 0) >= 3) {
    const nextCounts = cloneCounts(counts);
    decrement(nextCounts, first, 3);
    const tail = findMelds(nextCounts);

    if (tail) {
      return [[first, first, first], ...tail];
    }
  }

  if (isNumberTile(first)) {
    const second = nextNumberCode(first, 1);
    const third = nextNumberCode(first, 2);

    if (second && third && (counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
      const nextCounts = cloneCounts(counts);
      decrement(nextCounts, first, 1);
      decrement(nextCounts, second, 1);
      decrement(nextCounts, third, 1);
      const tail = findMelds(nextCounts);

      if (tail) {
        return [[first, second, third], ...tail];
      }
    }
  }

  return undefined;
}

function firstRemainingCode(counts: Counts): TileCode | undefined {
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([code]) => code)
    .sort((a, b) => tileSortValue(a) - tileSortValue(b))[0];
}

function nextNumberCode(code: TileCode, offset: number): TileCode | undefined {
  const prefix = tileSuitPrefix(code);
  const rank = tileRankNumber(code);

  if (prefix === "z" || rank < 1 || rank + offset > 9) {
    return undefined;
  }

  return `${prefix}${rank + offset}` as TileCode;
}

function isAllTriplets(pattern: WinPattern): boolean {
  return pattern.melds.every((meld) => meld.every((code) => code === meld[0]));
}

function isPureOneSuit(tiles: Tile[]): boolean {
  const suits = new Set<string>();

  for (const tile of tiles) {
    if (isHonorTile(tile.code)) {
      return false;
    }

    suits.add(tileSuitPrefix(tile.code));
  }

  return suits.size === 1;
}

function countHonorTriplets(pattern: WinPattern): number {
  return pattern.melds.filter(
    (meld) => meld.every((code) => code === meld[0]) && isHonorTile(meld[0]),
  ).length;
}

function cloneCounts(counts: Counts): Counts {
  return new Map(counts);
}

function decrement(counts: Counts, code: TileCode, amount: number): void {
  counts.set(code, (counts.get(code) ?? 0) - amount);
}
