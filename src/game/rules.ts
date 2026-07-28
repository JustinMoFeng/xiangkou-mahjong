import type { Meld, ScoreDetail, Tile, TileCode, WinKind, WinPattern } from "./types";
import {
  isHonorTile,
  isNumberTile,
  TILE_CODES,
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
  melds?: Meld[];
  flowers?: Tile[];
  bonusEvent?: "kong-draw" | "rob-kong";
};

export type ScoreOutput = {
  title: string;
  multiplier: number;
  details: ScoreDetail[];
};

const SCORE_CAP = 24;

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
          kind: "standard",
          pair,
          melds,
        },
      };
    }
  }

  return { canWin: false };
}

export function checkWinningHand(tiles: Tile[]): WinCheck {
  if (tiles.length === 14) {
    const thirteenOrphans = checkThirteenOrphans(tiles);
    if (thirteenOrphans.canWin) {
      return thirteenOrphans;
    }

    const sevenPairs = checkSevenPairs(tiles);
    if (sevenPairs.canWin) {
      return sevenPairs;
    }
  }

  return checkStandardWin(tiles);
}

export function scoreWinningHand(input: ScoreInput): ScoreOutput {
  const openMelds = input.melds ?? [];
  const flowers = input.flowers ?? [];
  const allTiles = [...input.tiles, ...openMelds.flatMap((meld) => meld.tiles)];
  const allMeldCodes = [...input.pattern.melds, ...openMelds.map((meld) => meld.tiles.map((tile) => tile.code))];
  const details: ScoreDetail[] = [{ name: "垃圾胡", multiplier: 1 }];
  const isClosedHand = openMelds.every((meld) => meld.kind === "kong" && meld.kongKind === "concealed");
  const isThirteenOrphans = input.pattern.kind === "thirteen-orphans";

  if (input.kind === "self-draw") {
    details.push({ name: "自摸", multiplier: 1 });
  }

  if (input.bonusEvent === "rob-kong") {
    details.push({ name: "抢杠胡", multiplier: 2 });
  }

  if (isClosedHand && !isThirteenOrphans) {
    details.push({ name: "门清", multiplier: 1 });
  }

  if (isThirteenOrphans) {
    details.push({ name: "国士无双", multiplier: 15 });
  }

  if (input.pattern.kind === "seven-pairs") {
    details.push({ name: "七对子", multiplier: 2 });
  }

  if (input.pattern.kind === "standard" && isAllTriplets(allMeldCodes)) {
    details.push({ name: "碰碰胡", multiplier: 2 });
  }

  for (const meld of openMelds) {
    if (meld.kind === "kong") {
      details.push({ name: "杠", multiplier: 2 });
    }
  }

  if (isPureOneSuit(allTiles)) {
    details.push({ name: "清一色", multiplier: 2 });
    details.push({ name: "清一色翻倍", multiplier: 2, operation: "multiply" });
  } else if (isHalfFlush(allTiles)) {
    details.push({ name: "混一色", multiplier: 2 });
  }

  if (input.bonusEvent === "kong-draw") {
    details.push({ name: "杠上开花", multiplier: 2, operation: "multiply" });
  }

  const honorTriplets = input.pattern.kind === "standard" ? countHonorTriplets(allMeldCodes) : 0;
  for (let index = 0; index < honorTriplets; index += 1) {
    details.push({ name: "字牌刻子", multiplier: 1 });
  }

  for (const flower of flowers) {
    details.push({ name: `花牌 ${flower.label}`, multiplier: 1 });
  }

  const rawMultiplier = calculateRawMultiplier(details);
  const multiplier = Math.min(rawMultiplier, SCORE_CAP);
  if (rawMultiplier > SCORE_CAP) {
    details.push({ name: "封顶", multiplier: SCORE_CAP, operation: "cap" });
  }
  const title = multiplier === 1 ? "垃圾胡" : details.map((detail) => detail.name).join(" + ");

  return {
    title,
    multiplier,
    details,
  };
}

function calculateRawMultiplier(details: ScoreDetail[]): number {
  const additiveTotal = details
    .filter((detail) => detail.operation !== "multiply" && detail.operation !== "cap")
    .reduce((total, detail) => total + detail.multiplier, 0);

  return details
    .filter((detail) => detail.operation === "multiply")
    .reduce((total, detail) => total * detail.multiplier, additiveTotal);
}

export function canWinWithTile(hand: Tile[], tile: Tile): WinCheck {
  return checkWinningHand([...hand, tile]);
}

function checkSevenPairs(tiles: Tile[]): WinCheck {
  const counts = countTileCodes(tiles);
  const pairUnits = [...counts.values()].reduce((total, count) => total + Math.floor(count / 2), 0);
  const allTilesPaired = [...counts.values()].every((count) => count === 2 || count === 4);

  if (!allTilesPaired || pairUnits !== 7) {
    return { canWin: false };
  }

  const pair = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([code]) => code)
    .sort((a, b) => tileSortValue(a) - tileSortValue(b))[0];

  return {
    canWin: true,
    pattern: {
      kind: "seven-pairs",
      pair,
      melds: [],
    },
  };
}

function checkThirteenOrphans(tiles: Tile[]): WinCheck {
  const required = terminalAndHonorCodes();
  const counts = countTileCodes(tiles);

  if ([...counts.keys()].some((code) => !required.includes(code))) {
    return { canWin: false };
  }

  if (required.some((code) => (counts.get(code) ?? 0) === 0)) {
    return { canWin: false };
  }

  const pair = required.find((code) => (counts.get(code) ?? 0) === 2);
  const hasIllegalCount = [...counts.values()].some((count) => count > 2);

  if (!pair || hasIllegalCount) {
    return { canWin: false };
  }

  return {
    canWin: true,
    pattern: {
      kind: "thirteen-orphans",
      pair,
      melds: [],
    },
  };
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

function terminalAndHonorCodes(): TileCode[] {
  return TILE_CODES.filter(
    (code) => isHonorTile(code) || (isNumberTile(code) && (tileRankNumber(code) === 1 || tileRankNumber(code) === 9)),
  );
}

function isAllTriplets(melds: TileCode[][]): boolean {
  return melds.length === 4 && melds.every((meld) => meld.every((code) => code === meld[0]));
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

function isHalfFlush(tiles: Tile[]): boolean {
  const suits = new Set<string>();
  let hasHonor = false;

  for (const tile of tiles) {
    if (isHonorTile(tile.code)) {
      hasHonor = true;
      continue;
    }

    suits.add(tileSuitPrefix(tile.code));
  }

  return hasHonor && suits.size === 1;
}

function countHonorTriplets(melds: TileCode[][]): number {
  return melds.filter(
    (meld) => meld.every((code) => code === meld[0]) && isHonorTile(meld[0]),
  ).length;
}

function cloneCounts(counts: Counts): Counts {
  return new Map(counts);
}

function decrement(counts: Counts, code: TileCode, amount: number): void {
  counts.set(code, (counts.get(code) ?? 0) - amount);
}
