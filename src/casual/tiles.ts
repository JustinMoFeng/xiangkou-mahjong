export type CasualTileCode =
  | "m1"
  | "m2"
  | "m3"
  | "m4"
  | "m5"
  | "m6"
  | "m7"
  | "m8"
  | "m9"
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "p7"
  | "p8"
  | "p9"
  | "s1"
  | "s2"
  | "s3"
  | "s4"
  | "s5"
  | "s6"
  | "s7"
  | "s8"
  | "s9"
  | "east"
  | "south"
  | "west"
  | "north"
  | "red"
  | "green"
  | "white";

export const CASUAL_TILE_CODES: CasualTileCode[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p7",
  "p8",
  "p9",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "east",
  "south",
  "west",
  "north",
  "red",
  "green",
  "white",
];

const labels: Record<CasualTileCode, string> = {
  m1: "一万",
  m2: "二万",
  m3: "三万",
  m4: "四万",
  m5: "五万",
  m6: "六万",
  m7: "七万",
  m8: "八万",
  m9: "九万",
  p1: "一筒",
  p2: "二筒",
  p3: "三筒",
  p4: "四筒",
  p5: "五筒",
  p6: "六筒",
  p7: "七筒",
  p8: "八筒",
  p9: "九筒",
  s1: "一条",
  s2: "二条",
  s3: "三条",
  s4: "四条",
  s5: "五条",
  s6: "六条",
  s7: "七条",
  s8: "八条",
  s9: "九条",
  east: "东风",
  south: "南风",
  west: "西风",
  north: "北风",
  red: "红中",
  green: "发财",
  white: "白板",
};

export function tileLabel(code: CasualTileCode): string {
  return labels[code];
}

export function tileAssetPath(code: CasualTileCode): string {
  return `${import.meta.env.BASE_URL}tiles/${code}.svg`;
}

export function createSeededRandom(seed = Date.now()): () => number {
  let state = Math.trunc(seed) % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function shuffleWithSeed<T>(items: readonly T[], seed = Date.now()): T[] {
  const result = [...items];
  const next = createSeededRandom(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}
