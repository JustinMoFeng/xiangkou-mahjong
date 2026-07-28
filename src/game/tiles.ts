import type { FlowerRank, HonorRank, Suit, Tile, TileCode } from "./types";
import { tileAssetPath as sharedTileAssetPath } from "./tileAssets";

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const HONORS = ["east", "south", "west", "north", "red", "green", "white"] as const;
const FLOWERS = ["spring", "summer", "autumn", "winter", "plum", "orchid", "bamboo", "chrysanthemum"] as const;

const suitMeta: Record<Exclude<Suit, "honors" | "flowers">, { prefix: "m" | "p" | "s"; suffix: string }> = {
  characters: { prefix: "m", suffix: "万" },
  dots: { prefix: "p", suffix: "筒" },
  bamboos: { prefix: "s", suffix: "条" },
};

const honorLabels: Record<HonorRank, { label: string; shortLabel: string }> = {
  east: { label: "东风", shortLabel: "东" },
  south: { label: "南风", shortLabel: "南" },
  west: { label: "西风", shortLabel: "西" },
  north: { label: "北风", shortLabel: "北" },
  red: { label: "红中", shortLabel: "中" },
  green: { label: "发财", shortLabel: "发" },
  white: { label: "白板", shortLabel: "白" },
};

const flowerLabels: Record<FlowerRank, { label: string; shortLabel: string }> = {
  spring: { label: "春", shortLabel: "春" },
  summer: { label: "夏", shortLabel: "夏" },
  autumn: { label: "秋", shortLabel: "秋" },
  winter: { label: "冬", shortLabel: "冬" },
  plum: { label: "梅", shortLabel: "梅" },
  orchid: { label: "兰", shortLabel: "兰" },
  bamboo: { label: "竹", shortLabel: "竹" },
  chrysanthemum: { label: "菊", shortLabel: "菊" },
};

export const TILE_CODES: TileCode[] = [
  ...NUMBERS.map((rank) => `m${rank}` as TileCode),
  ...NUMBERS.map((rank) => `p${rank}` as TileCode),
  ...NUMBERS.map((rank) => `s${rank}` as TileCode),
  ...HONORS,
  ...FLOWERS,
];

export function createWall(): Tile[] {
  const tiles: Tile[] = [];

  for (const [suit, meta] of Object.entries(suitMeta) as Array<
    [Exclude<Suit, "honors" | "flowers">, (typeof suitMeta)[Exclude<Suit, "honors" | "flowers">]]
  >) {
    for (const rank of NUMBERS) {
      const code = `${meta.prefix}${rank}` as TileCode;
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({
          id: `${code}-${copy}`,
          code,
          suit,
          rank,
          label: `${rank}${meta.suffix}`,
          shortLabel: `${rank}`,
        });
      }
    }
  }

  for (const honor of HONORS) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push({
        id: `${honor}-${copy}`,
        code: honor,
        suit: "honors",
        rank: honor,
        label: honorLabels[honor].label,
        shortLabel: honorLabels[honor].shortLabel,
      });
    }
  }

  for (const flower of FLOWERS) {
    tiles.push({
      id: `${flower}-0`,
      code: flower,
      suit: "flowers",
      rank: flower,
      label: flowerLabels[flower].label,
      shortLabel: flowerLabels[flower].shortLabel,
    });
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
  if (/^m[1-9]$/.test(code)) return Number(code.slice(1));
  if (/^p[1-9]$/.test(code)) return 20 + Number(code.slice(1));
  if (/^s[1-9]$/.test(code)) return 40 + Number(code.slice(1));
  if (isFlowerTile(code)) return 80 + FLOWERS.indexOf(code as FlowerRank);
  return 60 + HONORS.indexOf(code as HonorRank);
}

export function isNumberTile(code: TileCode): boolean {
  return /^[mps][1-9]$/.test(code);
}

export function isHonorTile(code: TileCode): boolean {
  return !isNumberTile(code) && !isFlowerTile(code);
}

export function isFlowerTile(code: TileCode): boolean {
  return (FLOWERS as readonly string[]).includes(code);
}

export function tileSuitPrefix(code: TileCode): "m" | "p" | "s" | "z" {
  if (isNumberTile(code)) {
    return code[0] as "m" | "p" | "s";
  }

  return "z";
}

export function tileRankNumber(code: TileCode): number {
  if (!isNumberTile(code)) {
    return -1;
  }

  return Number(code.slice(1));
}

export function tileColorClass(code: TileCode): string {
  if (/^m[1-9]$/.test(code)) return "tile--characters";
  if (/^p[1-9]$/.test(code)) return "tile--dots";
  if (/^s[1-9]$/.test(code)) return "tile--bamboos";
  if (isFlowerTile(code)) return "tile--flower";
  if (code === "red") return "tile--dragon-red";
  if (code === "green") return "tile--dragon-green";
  return "tile--honor";
}

export function tileAssetPath(code: TileCode | "back"): string {
  return sharedTileAssetPath(code);
}
