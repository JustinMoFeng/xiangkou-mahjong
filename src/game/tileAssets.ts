export const TILE_ASSET_CODES = [
  "back",
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
] as const;

export type TileAssetCode = (typeof TILE_ASSET_CODES)[number];

export function tileAssetPath(code: TileAssetCode): string {
  return `${import.meta.env.BASE_URL}tiles/${code}.svg`;
}

export function preloadTileAssets(): void {
  if (typeof window === "undefined") {
    return;
  }

  const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 1));
  schedule(() => {
    for (const code of TILE_ASSET_CODES) {
      const image = new Image();
      image.decoding = "async";
      image.src = tileAssetPath(code);
    }
  });
}
