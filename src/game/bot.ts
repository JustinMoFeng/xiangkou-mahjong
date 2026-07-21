import type { Tile } from "./types";
import { isHonorTile, tileRankNumber, tileSortValue, tileSuitPrefix } from "./tiles";

export function chooseBotDiscard(hand: Tile[]): Tile {
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

  if (isHonorTile(tile.code)) {
    return 5;
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
