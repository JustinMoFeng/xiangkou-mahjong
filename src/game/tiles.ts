import type { HonorRank, Suit, Tile, TileCode } from "./types";

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const HONORS = ["east", "south", "west", "north", "red", "green", "white"] as const;

const suitMeta: Record<Exclude<Suit, "honors">, { prefix: "m" | "p" | "s"; suffix: string }> = {
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

export const TILE_CODES: TileCode[] = [
  ...NUMBERS.map((rank) => `m${rank}` as TileCode),
  ...NUMBERS.map((rank) => `p${rank}` as TileCode),
  ...NUMBERS.map((rank) => `s${rank}` as TileCode),
  ...HONORS,
];

export function createWall(): Tile[] {
  const tiles: Tile[] = [];

  for (const [suit, meta] of Object.entries(suitMeta) as Array<
    [Exclude<Suit, "honors">, (typeof suitMeta)[Exclude<Suit, "honors">]]
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
  if (first === "m") return Number(code.slice(1));
  if (first === "p") return 20 + Number(code.slice(1));
  if (first === "s") return 40 + Number(code.slice(1));
  return 60 + HONORS.indexOf(code as HonorRank);
}

export function isNumberTile(code: TileCode): boolean {
  return code.startsWith("m") || code.startsWith("p") || code.startsWith("s");
}

export function isHonorTile(code: TileCode): boolean {
  return !isNumberTile(code);
}

export function tileSuitPrefix(code: TileCode): "m" | "p" | "s" | "z" {
  if (code.startsWith("m") || code.startsWith("p") || code.startsWith("s")) {
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
  if (code.startsWith("m")) return "tile--characters";
  if (code.startsWith("p")) return "tile--dots";
  if (code.startsWith("s")) return "tile--bamboos";
  if (code === "red") return "tile--dragon-red";
  if (code === "green") return "tile--dragon-green";
  return "tile--honor";
}

export function tileAssetPath(code: TileCode | "back"): string {
  return `${import.meta.env.BASE_URL}tiles/${code}.svg`;
}
