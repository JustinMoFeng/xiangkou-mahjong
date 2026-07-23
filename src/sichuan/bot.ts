import type { SuitPrefix, Tile } from "./types";
import { tileRankNumber, tileSortValue, tileSuitPrefix } from "./tiles";

export function chooseBotMissingSuit(hand: Tile[]): SuitPrefix {
  const counts: Record<SuitPrefix, number> = { m: 0, p: 0, s: 0 };
  for (const tile of hand) {
    counts[tile.suit] += 1;
  }
  return (["m", "p", "s"] as const).reduce((best, suit) => (counts[suit] < counts[best] ? suit : best), "m");
}

export function chooseBotDiscard(hand: Tile[], missingSuit?: SuitPrefix): Tile {
  const missing = hand.filter((tile) => tile.suit === missingSuit);
  if (missing.length > 0) {
    // 优先打缺门，先打孤张。
    return [...missing].sort((a, b) => discardValue(a, hand) - discardValue(b, hand))[0];
  }

  const sorted = [...hand].sort((a, b) => discardValue(a, hand) - discardValue(b, hand));
  return sorted[0];
}

function discardValue(tile: Tile, hand: Tile[]): number {
  const sameCount = hand.filter((item) => item.code === tile.code).length;

  if (sameCount >= 3) {
    return 90;
  }
  if (sameCount === 2) {
    return 70;
  }

  const rank = tileRankNumber(tile.code);
  const suit = tileSuitPrefix(tile.code);
  const neighbors = hand.filter((item) => {
    if (tileSuitPrefix(item.code) !== suit) {
      return false;
    }
    const otherRank = tileRankNumber(item.code);
    return otherRank !== rank && Math.abs(otherRank - rank) <= 2;
  }).length;

  const edgePenalty = rank === 1 || rank === 9 ? 6 : rank === 2 || rank === 8 ? 3 : 0;
  return 20 + neighbors * 16 - edgePenalty + tileSortValue(tile.code) / 100;
}
