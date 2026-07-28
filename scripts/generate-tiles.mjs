import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tileToSvg } from "tilekit";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, "public", "tiles");

const mappings = [
  ...Array.from({ length: 9 }, (_, index) => [`m${index + 1}`, `${index + 1}m`]),
  ...Array.from({ length: 9 }, (_, index) => [`p${index + 1}`, `${index + 1}p`]),
  ...Array.from({ length: 9 }, (_, index) => [`s${index + 1}`, `${index + 1}s`]),
  ["east", "E"],
  ["south", "S"],
  ["west", "W"],
  ["north", "N"],
  ["red", "rd"],
  ["green", "gd"],
  ["white", "wd"],
  ["back", "back"],
];

const flowerMappings = [
  ["spring", "春", "#2f9b5c"],
  ["summer", "夏", "#c53d2f"],
  ["autumn", "秋", "#b7791f"],
  ["winter", "冬", "#2473a6"],
  ["plum", "梅", "#b73567"],
  ["orchid", "兰", "#6653b8"],
  ["bamboo", "竹", "#2e8751"],
  ["chrysanthemum", "菊", "#c28a17"],
];

mkdirSync(outputDir, { recursive: true });

for (const [name, notation] of mappings) {
  const svg = tileToSvg(notation, {
    width: 96,
    height: 128,
    radius: 10,
    depth: 6,
    fit: true,
    faceColor: "#fbf4e2",
    faceColorTop: "#fffef6",
    edgeColor: "#d4c19b",
    backColor: "#1f694e",
    backColorTop: "#2c8060",
    backRibColor: "#15513d",
    sideColor: "#1c5c45",
    sideShadow: "#123a2d",
  });

  writeFileSync(join(outputDir, `${name}.svg`), svg);
}

for (const [name, label, color] of flowerMappings) {
  writeFileSync(join(outputDir, `${name}.svg`), flowerTileSvg(label, color));
}

function flowerTileSvg(label, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 102 134" role="img" aria-label="${label} flower tile">
  <defs>
    <linearGradient id="flower-face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffef6"/>
      <stop offset="1" stop-color="#fbf4e2"/>
    </linearGradient>
  </defs>
  <rect x="3" y="4.2" width="96" height="128" rx="10" fill="#1c5c45"/>
  <rect x="0" y="0" width="96" height="128" rx="10" fill="url(#flower-face)" stroke="#d4c19b" stroke-width="1"/>
  <path d="M20 26 C28 14 42 16 48 29 C56 16 72 17 80 29 C70 31 63 37 58 48 C51 40 42 39 34 48 C31 38 26 31 20 26Z" fill="${color}" opacity="0.18"/>
  <text x="48" y="80" text-anchor="middle" font-size="54" font-family="KaiTi, STKaiti, serif" font-weight="700" fill="${color}">${label}</text>
  <circle cx="28" cy="101" r="3.5" fill="${color}" opacity="0.55"/>
  <circle cx="48" cy="106" r="3.5" fill="${color}" opacity="0.55"/>
  <circle cx="68" cy="101" r="3.5" fill="${color}" opacity="0.55"/>
</svg>`;
}
