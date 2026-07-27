import type { SuitPrefix, Tile, TileCode } from "./types";
import { tileAssetPath as sharedTileAssetPath } from "../game/tileAssets";

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const suitMeta: Record<SuitPrefix, { suffix: string }> = {
  m: { suffix: "万" },
  p: { suffix: "筒" },
  s: { suffix: "条" },
};

export const SUIT_LABELS: Record<SuitPrefix, string> = {
  m: "万",
  p: "筒",
  s: "条",
};

export const TILE_CODES: TileCode[] = (["m", "p", "s"] as const).flatMap((prefix) =>
  NUMBERS.map((rank) => `${prefix}${rank}` as TileCode),
);

export function createWall(): Tile[] {
  const tiles: Tile[] = [];

  for (const prefix of ["m", "p", "s"] as const) {
    for (const rank of NUMBERS) {
      const code = `${prefix}${rank}` as TileCode;
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({
          id: `${code}-${copy}`,
          code,
          suit: prefix,
          rank,
          label: `${rank}${suitMeta[prefix].suffix}`,
          shortLabel: `${rank}`,
        });
      }
    }
  }

  return tiles;
}

export function shuffleTiles<T>(items: T[], seed = Date.now()): T[] {
  const result = [...items];
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  const next = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileSortValue(a.code) - tileSortValue(b.code));
}

export function tileSortValue(code: TileCode): number {
  const first = code[0];
  const rank = Number(code.slice(1));
  if (first === "m") return rank;
  if (first === "p") return 20 + rank;
  return 40 + rank;
}

export function tileSuitPrefix(code: TileCode): SuitPrefix {
  return code[0] as SuitPrefix;
}

export function tileRankNumber(code: TileCode): number {
  return Number(code.slice(1));
}

export function tileColorClass(code: TileCode): string {
  if (code.startsWith("m")) return "tile--characters";
  if (code.startsWith("p")) return "tile--dots";
  return "tile--bamboos";
}

export function tileAssetPath(code: TileCode | "back"): string {
  return sharedTileAssetPath(code);
}
