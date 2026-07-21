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
